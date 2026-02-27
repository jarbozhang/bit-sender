import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_TEMPLATES, initializeDefaultTemplates } from './defaultTemplates';

describe('DEFAULT_TEMPLATES', () => {
  it('has unique ids', () => {
    const ids = DEFAULT_TEMPLATES.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every template has required fields', () => {
    for (const tmpl of DEFAULT_TEMPLATES) {
      expect(tmpl).toHaveProperty('id');
      expect(tmpl).toHaveProperty('name');
      expect(tmpl).toHaveProperty('protocol');
      expect(tmpl).toHaveProperty('fields');
      expect(tmpl).toHaveProperty('tags');
      expect(typeof tmpl.id).toBe('string');
      expect(typeof tmpl.name).toBe('string');
      expect(typeof tmpl.protocol).toBe('string');
      expect(typeof tmpl.fields).toBe('object');
      expect(Array.isArray(tmpl.tags)).toBe(true);
    }
  });

  it('covers expected protocols', () => {
    const protocols = DEFAULT_TEMPLATES.map(t => t.protocol);
    expect(protocols).toContain('arp');
    expect(protocols).toContain('tcp');
    expect(protocols).toContain('udp');
    expect(protocols).toContain('ethernet');
  });
});

describe('initializeDefaultTemplates', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('writes all defaults when localStorage is empty', () => {
    const result = initializeDefaultTemplates();
    expect(result).toEqual(DEFAULT_TEMPLATES);
    const stored = JSON.parse(localStorage.getItem('packet-templates'));
    expect(stored.length).toBe(DEFAULT_TEMPLATES.length);
  });

  it('merges missing defaults into existing templates', () => {
    // Store only the first template
    const partial = [DEFAULT_TEMPLATES[0]];
    localStorage.setItem('packet-templates', JSON.stringify(partial));

    const result = initializeDefaultTemplates();
    expect(result.length).toBe(DEFAULT_TEMPLATES.length);
    // Original template should still be there
    expect(result.find(t => t.id === DEFAULT_TEMPLATES[0].id)).toBeTruthy();
  });

  it('preserves custom (non-default) templates', () => {
    const custom = { id: 'custom-1', name: 'My Custom', protocol: 'ethernet', fields: {}, tags: [] };
    localStorage.setItem('packet-templates', JSON.stringify([custom]));

    const result = initializeDefaultTemplates();
    expect(result.find(t => t.id === 'custom-1')).toBeTruthy();
    expect(result.length).toBe(DEFAULT_TEMPLATES.length + 1);
  });

  it('returns existing templates when all defaults already present', () => {
    localStorage.setItem('packet-templates', JSON.stringify(DEFAULT_TEMPLATES));
    const result = initializeDefaultTemplates();
    expect(result).toEqual(DEFAULT_TEMPLATES);
  });

  it('returns empty array on corrupted localStorage data', () => {
    localStorage.setItem('packet-templates', 'not-valid-json{{{');
    const result = initializeDefaultTemplates();
    expect(result).toEqual([]);
  });
});
