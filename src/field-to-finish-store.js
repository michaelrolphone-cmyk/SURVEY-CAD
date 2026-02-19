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
  constructor({ loadDefaultConfig }) {
    if (typeof loadDefaultConfig !== 'function') {
      throw new Error('loadDefaultConfig is required.');
    }
    this.loadDefaultConfig = loadDefaultConfig;
    this.defaultConfig = null;
    this.overrideConfig = null;
    this.revision = 0;
    this.updatedAt = null;
  }

  async ensureDefaultConfig() {
    if (this.defaultConfig) return;
    const loaded = await this.loadDefaultConfig();
    if (!isValidConfig(loaded)) {
      throw new Error('Default Field-to-Finish config is invalid.');
    }
    this.defaultConfig = cloneConfig(loaded);
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
    return this.getState();
  }

  async deleteOverride() {
    await this.ensureDefaultConfig();
    this.overrideConfig = null;
    this.revision += 1;
    this.updatedAt = new Date().toISOString();
    return this.getState();
  }
}
