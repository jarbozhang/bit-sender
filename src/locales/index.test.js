import { describe, it, expect } from 'vitest';
import { useTranslation } from './index';

describe('useTranslation', () => {
  describe('basic key lookup', () => {
    it('finds zh-CN key', () => {
      const { t } = useTranslation('zh-CN');
      expect(t('common.appTitle')).toBe('比达发包器');
    });

    it('finds en-US key', () => {
      const { t } = useTranslation('en-US');
      expect(t('common.appTitle')).toBe('BIT SENDER');
    });

    it('finds nested keys', () => {
      const { t } = useTranslation('zh-CN');
      expect(t('common.cancel')).toBe('取消');
    });
  });

  describe('fallback behavior', () => {
    it('falls back to zh-CN for unknown language', () => {
      const { t } = useTranslation('fr-FR');
      expect(t('common.appTitle')).toBe('比达发包器');
    });

    it('returns key itself when key is missing and no defaultValue', () => {
      const { t } = useTranslation('zh-CN');
      expect(t('nonexistent.key')).toBe('nonexistent.key');
    });

    it('returns defaultValue when key is missing', () => {
      const { t } = useTranslation('zh-CN');
      expect(t('nonexistent.key', 'fallback')).toBe('fallback');
    });
  });

  describe('parameter replacement', () => {
    it('replaces single parameter', () => {
      const { t } = useTranslation('zh-CN');
      // import.autoDetected = "自动识别为 {protocol} 协议"
      const result = t('import.autoDetected', 'fallback', { protocol: 'TCP' });
      expect(result).toContain('TCP');
      expect(result).not.toContain('{protocol}');
    });

    it('replaces same parameter appearing multiple times', () => {
      const { t } = useTranslation('zh-CN');
      const result = t('import.autoDetected', 'fallback', { protocol: 'ARP' });
      expect(result).toContain('ARP');
    });

    it('replaces multiple different parameters', () => {
      const { t } = useTranslation('zh-CN');
      // export.success = "已导出到: {path}"
      const result = t('export.success', 'fallback', { path: '/tmp/test.pcap' });
      expect(result).toContain('/tmp/test.pcap');
    });
  });
});
