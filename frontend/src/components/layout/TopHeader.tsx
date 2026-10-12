/**
 * TopHeader Component Bridge
 * Filename: frontend/src/components/layout/TopHeader.tsx
 * Exports the primary navigation header with Tenant Owner branding and role badge.
 */

import React from 'react';
import { Navbar, NavbarProps } from '../Navbar';

export { Navbar as TopHeader };
export type { NavbarProps as TopHeaderProps };
export default Navbar;
