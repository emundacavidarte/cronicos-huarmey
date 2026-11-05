/**
 * cuerpoJson.js
 * Lectura del cuerpo JSON con límite propio por ruta (F2-07). Se monta DESPUÉS de exigir la sesión (salvo el login,
 * que tiene un límite de 10 KB): un cuerpo de 10 MB sin token ya no se analiza. Solo se acepta application/json:
 * text/plain ya no se interpreta como JSON (415).
 */
const express = require('express');

const TIPOS_JSON = ['application/json', 'application/*+json'];

function exigirJson(req, res, next) {
  const tieneCuerpo = req.headers['transfer-encoding'] !== undefined ||
    (req.headers['content-length'] !== undefined && req.headers['content-length'] !== '0');
  if (!tieneCuerpo || req.is(TIPOS_JSON)) return next();
  return res.status(415).json({
    resourceType: 'OperationOutcome',
    issue: [{ severity: 'error', code: 'invalid', diagnostics: 'Tipo de contenido no admitido: envíe application/json.' }]
  });
}

function cuerpoJson(limit) {
  return [exigirJson, express.json({ limit, type: TIPOS_JSON })];
}

module.exports = { cuerpoJson };
