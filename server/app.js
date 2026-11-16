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
