'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const seed = require('../data.js');
const Engine = require('../engine.js');
const { openDatabase, createStore } = require('./db.js');
const { seedUsers, createAuth } = require('./auth.js');

const VERSION = '1.0.0';
const BODY_LIMIT = 16 * 1024;
const PORTALS = ['client', 'admin'];
const SCOPES = { client: 'client portal', admin: 'control room console' };

/* The only files the server will ever send. Nothing else on disk is reachable. */
const STATIC_FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/script.js': ['script.js', 'text/javascript; charset=utf-8'],
  '/engine.js': ['engine.js', 'text/javascript; charset=utf-8']
};

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

class HttpError extends Error {
  constructor(status, code, extra) {
    super(code);
    this.status = status;
    this.body = { error: code, ...extra };
  }
}

function sendJson(res, status, body, headers) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(text);
}

function readCookies(req) {
  const cookies = {};
  String(req.headers.cookie || '').split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index > 0) {
      cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
    }
  });
  return cookies;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(new HttpError(413, 'too-large'));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('not an object');
        }
        resolve(parsed);
      } catch (error) {
        reject(new HttpError(400, 'bad-json'));
      }
    });
    req.on('error', reject);
  });
}

/* Requests that change something must be JSON sent by the page itself. A form
   on another site cannot set this header or content type, and the session
   cookie is SameSite=Strict as a second barrier. */
function guardWrite(req) {
  const type = String(req.headers['content-type'] || '');
  if (!type.startsWith('application/json') || req.headers['x-requested-with'] !== 'maatora') {
    throw new HttpError(403, 'forbidden');
  }
  const origin = req.headers.origin;
  if (origin) {
    let host = '';
    try {
      host = new URL(origin).host;
    } catch (error) {
      host = '';
    }
    if (host !== req.headers.host) {
      throw new HttpError(403, 'forbidden');
    }
  }
}
