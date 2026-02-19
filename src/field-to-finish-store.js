import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config));
}

function isValidConfig(config) {
  return Boolean(
    config
    && typeof config === 'object'
    && Array.isArray(config.columns)
    && Array.isArray(config.rules),
  );
}

export class FieldToFinishStore {
  constructor({ loadDefaultConfig, overrideFilePath = '' }) {
    if (typeof loadDefaultConfig !== 'function') {
      throw new Error('loadDefaultConfig is required.');
    }
    this.loadDefaultConfig = loadDefaultConfig;
    this.defaultConfig = null;
    this.overrideFilePath = String(overrideFilePath || '').trim();
    this.overrideConfig = null;
    this.revision = 0;
    this.updatedAt = null;
    this.persistedOverrideLoaded = false;
  }

  async ensurePersistedOverrideLoaded() {
    if (this.persistedOverrideLoaded) return;
    this.persistedOverrideLoaded = true;
    if (!this.overrideFilePath) return;

    let raw = '';
    try {
      raw = await readFile(this.overrideFilePath, 'utf8');
    } catch (err) {
      if (err?.code !== 'ENOENT') throw err;
      return;
    }

    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    const overrideConfig = parsed?.overrideConfig;
    if (isValidConfig(overrideConfig)) {
      this.overrideConfig = cloneConfig(overrideConfig);
      this.revision = Number.isFinite(parsed?.revision) ? Math.max(0, Math.trunc(parsed.revision)) : this.revision;
      this.updatedAt = typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : this.updatedAt;
    }
  }

  async persistOverrideState() {
    if (!this.overrideFilePath) return;
    if (!isValidConfig(this.overrideConfig)) {
      try {
        await unlink(this.overrideFilePath);
      } catch (err) {
        if (err?.code !== 'ENOENT') throw err;
      }
      return;
    }

    await mkdir(path.dirname(this.overrideFilePath), { recursive: true });
    await writeFile(this.overrideFilePath, JSON.stringify({
      overrideConfig: this.overrideConfig,
      revision: this.revision,
      updatedAt: this.updatedAt,
    }, null, 2));
  }

  async ensureDefaultConfig() {
    if (this.defaultConfig) return;
    const loaded = await this.loadDefaultConfig();
    if (!isValidConfig(loaded)) {
      throw new Error('Default Field-to-Finish config is invalid.');
    }
    this.defaultConfig = cloneConfig(loaded);
    await this.ensurePersistedOverrideLoaded();
  }

  async getState() {
    await this.ensureDefaultConfig();
    const hasOverride = isValidConfig(this.overrideConfig);
    const effectiveConfig = hasOverride ? this.overrideConfig : this.defaultConfig;
    return {
      config: cloneConfig(effectiveConfig),
      hasOverride,
      source: hasOverride ? 'api-override' : 'server-default',
      revision: this.revision,
      updatedAt: this.updatedAt,
    };
  }

  async createOverride(config) {
    await this.ensureDefaultConfig();
    if (isValidConfig(this.overrideConfig)) {
      throw new Error('Field-to-Finish override already exists. Use PUT to update it.');
    }
    return this.putOverride(config);
  }

  async putOverride(config) {
    await this.ensureDefaultConfig();
    if (!isValidConfig(config)) {
      throw new Error('Field-to-Finish config must include columns[] and rules[].');
    }
    this.overrideConfig = cloneConfig(config);
    this.revision += 1;
    this.updatedAt = new Date().toISOString();
    await this.persistOverrideState();
    return this.getState();
  }

  async deleteOverride() {
    await this.ensureDefaultConfig();
    this.overrideConfig = null;
    this.revision += 1;
    this.updatedAt = new Date().toISOString();
    await this.persistOverrideState();
    return this.getState();
  }
}
