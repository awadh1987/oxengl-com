// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { SearchableSelect, SelectOption } from './SearchableSelect';

describe('SearchableSelect Component', () => {
  afterEach(() => {
    cleanup();
  });

  const sampleOptions: SelectOption[] = [
    { value: 'trans-1', label: 'Transporter Al-Majd', subLabel: 'Driver: Tariq' },
    { value: 'trans-2', label: 'Al-Fursan Logistics', subLabel: 'Driver: Khalid' },
    { value: 'trans-3', label: 'Najd Haulage', subLabel: 'Driver: Salem' },
  ];

  it('renders trigger with selected value or placeholder', () => {
    const handleChange = vi.fn();
    const { rerender } = render(
      <SearchableSelect
        id="test-select"
        value=""
        onChange={handleChange}
        options={sampleOptions}
        placeholder="Select transporter..."
      />
    );

    expect(screen.getByRole('combobox')).toHaveTextContent('Select transporter...');

    rerender(
      <SearchableSelect
        id="test-select"
        value="trans-1"
        onChange={handleChange}
        options={sampleOptions}
        placeholder="Select transporter..."
      />
    );

    expect(screen.getByRole('combobox')).toHaveTextContent('Transporter Al-Majd');
  });

  it('opens portallized dropdown menu with high z-index on click', () => {
    const handleChange = vi.fn();
    render(
      <SearchableSelect
        id="test-select"
        value=""
        onChange={handleChange}
        options={sampleOptions}
        placeholder="Select transporter..."
      />
    );

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    // Click trigger to open
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const menuPanel = screen.getByRole('listbox');
    expect(menuPanel).toBeInTheDocument();
    // Verify it is portalled into document.body with high z-index (9999)
    expect(document.body).toContainElement(menuPanel);
    expect(menuPanel).toHaveStyle({ zIndex: '9999' });

    const menuScope = within(menuPanel);
    expect(menuScope.getByText('Transporter Al-Majd')).toBeInTheDocument();
    expect(menuScope.getByText('Al-Fursan Logistics')).toBeInTheDocument();
    expect(menuScope.getByText('Najd Haulage')).toBeInTheDocument();
  });

  it('filters options when typing in the search input', async () => {
    const handleChange = vi.fn();
    render(
      <SearchableSelect
        id="test-select"
        value=""
        onChange={handleChange}
        options={[
          ...sampleOptions,
          { value: 'trans-4', label: 'Extra 1' },
          { value: 'trans-5', label: 'Extra 2' },
          { value: 'trans-6', label: 'Extra 3' },
        ]}
      />
    );

    fireEvent.click(screen.getByRole('combobox'));

    const searchInput = screen.getByPlaceholderText(/Search options/i);
    await userEvent.type(searchInput, 'Fursan');

    const menuPanel = screen.getByRole('listbox');
    const menuScope = within(menuPanel);
    expect(menuScope.getByText('Al-Fursan Logistics')).toBeInTheDocument();
    expect(menuScope.queryByText('Najd Haulage')).not.toBeInTheDocument();
  });

  it('selects option and triggers onChange callback', () => {
    const handleChange = vi.fn();
    render(
      <SearchableSelect
        id="test-select"
        value=""
        onChange={handleChange}
        options={sampleOptions}
      />
    );

    fireEvent.click(screen.getByRole('combobox'));
    const menuPanel = screen.getByRole('listbox');
    const option = within(menuPanel).getByText('Al-Fursan Logistics');
    fireEvent.click(option);

    expect(handleChange).toHaveBeenCalledWith('trans-2');
  });

  it('closes dropdown when Escape key is pressed', () => {
    const handleChange = vi.fn();
    render(
      <SearchableSelect
        id="test-select"
        value=""
        onChange={handleChange}
        options={sampleOptions}
      />
    );

    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
