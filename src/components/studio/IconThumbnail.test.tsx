import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PALETTES } from '../../types.ts';
import { getIconDisplayName, IconThumbnail } from './IconThumbnail.tsx';

describe('IconThumbnail and getIconDisplayName', () => {
  const theme = DEFAULT_PALETTES.teal;

  describe('getIconDisplayName', () => {
    it('resolves standard vector registry icons', () => {
      expect(getIconDisplayName('gitMerge')).toBe('Git Merge');
      expect(getIconDisplayName('cpu')).toBe('CPU / Microchip');
      expect(getIconDisplayName('database')).toBe('Database');
    });

    it('resolves curated tech brands and aliases', () => {
      expect(getIconDisplayName('postgresql')).toBe('PostgreSQL');
      expect(getIconDisplayName('postgres')).toBe('PostgreSQL');
      expect(getIconDisplayName('k8s')).toBe('Kubernetes');
      expect(getIconDisplayName('redis')).toBe('Redis');
      expect(getIconDisplayName('docker')).toBe('Docker');
    });

    it('resolves CDN URLs and handles query parameters', () => {
      expect(
        getIconDisplayName('https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/postgresql.svg')
      ).toBe('PostgreSQL');
      expect(
        getIconDisplayName('https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/fastapi.svg?color=%2300ff00')
      ).toBe('FastAPI');
    });

    it('handles empty or custom strings gracefully', () => {
      expect(getIconDisplayName('')).toBe('Select Icon');
      expect(getIconDisplayName('telemetryService')).toBe('TelemetryService');
    });
  });

  describe('IconThumbnail component', () => {
    it('renders an SVG element for ICONS_REGISTRY items', () => {
      const { container } = render(<IconThumbnail icon="cpu" theme={theme} className="w-5 h-5" />);
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('viewBox', '0 0 64 64');
    });

    it('renders safely even without theme', () => {
      const { container } = render(<IconThumbnail icon="cpu" className="w-5 h-5" />);
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('stroke', '#10B981');
    });

    it('renders an img element with proxy/CDN URL for tech brands', () => {
      render(<IconThumbnail icon="postgresql" theme={theme} className="w-5 h-5" />);
      const img = screen.getByRole('img');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('alt', 'PostgreSQL');
      expect(img.getAttribute('src')).toMatch(/data:image\/svg\+xml|\/api\/proxy-image\?url=/);
    });

    it('renders an img element for web URLs', () => {
      const url = 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/redis.svg';
      render(<IconThumbnail icon={url} theme={theme} className="w-5 h-5" />);
      const img = screen.getByRole('img');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('alt', 'Redis');
      expect(img.getAttribute('src')).toContain(encodeURIComponent(url));
    });
  });
});
