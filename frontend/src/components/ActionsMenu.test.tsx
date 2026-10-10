// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ActionsMenu } from './ActionsMenu';
import { Download, FileSpreadsheet, Printer, Upload } from 'lucide-react';

describe('ActionsMenu Component', () => {
  afterEach(() => {
    cleanup();
  });
  const defaultItems = [
    { id: 'bulk-import-btn', label: 'Bulk Import (.xlsx)', icon: Upload, onSelect: vi.fn() },
    { id: 'export-json-btn', label: 'JSON Snapshot', icon: Download, onSelect: vi.fn() },
    { id: 'export-excel-btn', label: 'Export Excel', icon: FileSpreadsheet, onSelect: vi.fn() },
    { id: 'print-btn', label: 'Export & Print', icon: Printer, onSelect: vi.fn() },
  ];

  it('renders action trigger button with "Actions / More" label', () => {
    render(<ActionsMenu items={defaultItems} isArabic={false} isDark={true} />);
    const trigger = screen.getByRole('button', { name: /Actions \/ More/i });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens portallized dropdown menu with z-index 9999 attached to document.body on click', () => {
    render(<ActionsMenu items={defaultItems} isArabic={false} isDark={true} />);
    const trigger = screen.getByRole('button', { name: /Actions \/ More/i });
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // Menu panel must be portalled directly into document.body
    const menu = screen.getByRole('menu');
    expect(menu).toBeInTheDocument();
    expect(document.body).toContainElement(menu);
    expect(menu).toHaveStyle({ zIndex: '9999' });
    expect(menu).toHaveClass('erp-dropdown-menu-panel');

    // Menu items must all be rendered cleanly
    expect(screen.getByText('Bulk Import (.xlsx)')).toBeInTheDocument();
    expect(screen.getByText('JSON Snapshot')).toBeInTheDocument();
    expect(screen.getByText('Export Excel')).toBeInTheDocument();
    expect(screen.getByText('Export & Print')).toBeInTheDocument();
  });

  it('triggers item onSelect callback and closes menu upon selection', () => {
    const customItems = [
      { id: 'custom-btn-1', label: 'Option 1', icon: Upload, onSelect: vi.fn() },
      { id: 'custom-btn-2', label: 'Option 2', icon: Download, onSelect: vi.fn() },
    ];
    render(<ActionsMenu items={customItems} isArabic={false} isDark={true} />);
    const trigger = screen.getByRole('button', { name: /Actions \/ More/i });
    fireEvent.click(trigger);

    const option2Btn = screen.getByText('Option 2');
    fireEvent.click(option2Btn);

    expect(customItems[1].onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes dropdown when Escape key is pressed', () => {
    render(<ActionsMenu items={defaultItems} isArabic={false} isDark={true} />);
    const trigger = screen.getByRole('button', { name: /Actions \/ More/i });
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('renders localized label in Arabic mode', () => {
    render(<ActionsMenu items={defaultItems} isArabic={true} isDark={true} />);
    expect(screen.getByRole('button', { name: /الإجراءات/i })).toBeInTheDocument();
  });
});
