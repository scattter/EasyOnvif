import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { resolveStorageRoot } from './storage-path';

describe('resolveStorageRoot', () => {
  it('prefers STORAGE_PATH when provided', () => {
    expect(resolveStorageRoot('/tmp/workdir', '/custom/storage')).toBe('/custom/storage');
  });

  it('uses ../storage when it exists', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'easyonvif-parent-'));
    const cwd = path.join(tempRoot, 'backend');
    const parentStorage = path.join(tempRoot, 'storage');
    fs.mkdirSync(cwd, { recursive: true });
    fs.mkdirSync(parentStorage, { recursive: true });

    expect(resolveStorageRoot(cwd)).toBe(parentStorage);
  });

  it('falls back to ./storage when ../storage is missing', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'easyonvif-local-'));
    const cwd = path.join(tempRoot, 'app');
    const localStorage = path.join(cwd, 'storage');
    fs.mkdirSync(localStorage, { recursive: true });

    expect(resolveStorageRoot(cwd)).toBe(localStorage);
  });

  it('defaults to ../storage when neither exists', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'easyonvif-default-'));
    const cwd = path.join(tempRoot, 'backend');
    fs.mkdirSync(cwd, { recursive: true });

    expect(resolveStorageRoot(cwd)).toBe(path.resolve(cwd, '../storage'));
  });
});
