import fs from 'node:fs';
import path from 'node:path';

function matchesType(value, expected) {
  if (expected === 'null') return value === null;
  if (expected === 'array') return Array.isArray(value);
  if (expected === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (expected === 'integer') return Number.isInteger(value);
  if (expected === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === expected;
}

function isDateTime(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}

function validateNode(value, schema, location, errors) {
  if (!schema || Object.keys(schema).length === 0) return;
  if (Object.hasOwn(schema, 'const') && value !== schema.const) errors.push(`${location} must equal ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${location} must be one of ${schema.enum.join(', ')}`);

  const types = schema.type ? (Array.isArray(schema.type) ? schema.type : [schema.type]) : [];
  if (types.length > 0 && !types.some(type => matchesType(value, type))) {
    errors.push(`${location} must be ${types.join(' or ')}`);
    return;
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${location} is shorter than ${schema.minLength}`);
    if (schema.pattern && !(new RegExp(schema.pattern).test(value))) errors.push(`${location} does not match ${schema.pattern}`);
    if (schema.format === 'date-time' && !isDateTime(value)) errors.push(`${location} must be an ISO date-time`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${location} must be >= ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${location} must be <= ${schema.maximum}`);
  }
  if (Array.isArray(value) && schema.items) {
    value.forEach((item, index) => validateNode(item, schema.items, `${location}[${index}]`, errors));
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const required of schema.required || []) {
      if (!Object.hasOwn(value, required)) errors.push(`${location}.${required} is required`);
    }
    for (const [key, propertyValue] of Object.entries(value)) {
      const propertySchema = schema.properties?.[key];
      if (!propertySchema && schema.additionalProperties === false) errors.push(`${location}.${key} is not allowed`);
      if (propertySchema) validateNode(propertyValue, propertySchema, `${location}.${key}`, errors);
    }
  }
}

export function validateSchema(value, schema) {
  const errors = [];
  validateNode(value, schema, '$', errors);
  return { valid: errors.length === 0, errors };
}

export function loadContractSchema(name, root = process.cwd()) {
  const filePath = path.join(root, 'contracts', 'schemas', `${name}.schema.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function assertContract(name, value, root = process.cwd()) {
  const result = validateSchema(value, loadContractSchema(name, root));
  if (!result.valid) throw new Error(`${name} contract validation failed: ${result.errors.join('; ')}`);
  return value;
}

