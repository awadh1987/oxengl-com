# Global UI Component Enhancement: Interactive Hover-Lightable Icons

## Overview
Implement the dynamic, smooth-transitioning interactive hover-lightable icon effect (modeled after the login button arrow state change) across all interactive elements, navigation items, buttons, and action tables platform-wide.

## Technical Implementation Specification

### 1. CSS / Tailwind Transition Rules
Add the standard opacity transition utility and stacking classes to the global CSS stylesheet (`frontend/src/index.css` or Tailwind configuration):

```css
.hover-lightable-icon {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

.hover-lightable-icon img,
.hover-lightable-icon svg {
    position: absolute;
    inset: 0;
    transition: opacity 0.3s ease-in-out;
}

.hover-lightable-icon .icon-default {
    opacity: 1;
}

.hover-lightable-icon .icon-hover {
    opacity: 0;
}

.group:hover .hover-lightable-icon .icon-default,
.hover-lightable-container:hover .hover-lightable-icon .icon-default {
    opacity: 0;
}

.group:hover .hover-lightable-icon .icon-hover,
.hover-lightable-container:hover .hover-lightable-icon .icon-hover {
    opacity: 1;
}

2. Reusable React Component Wrapper (HoverIcon.tsx)
Create a centralized wrapper component to handle dual-state icon rendering cleanly:

TypeScript
import React from 'react';

interface HoverIconProps {
  defaultIcon: React.ReactNode;
  hoverIcon: React.ReactNode;
  className?: string;
}

export const HoverIcon: React.FC<HoverIconProps> = ({ defaultIcon, hoverIcon, className = "w-5 h-5" }) => {
  return (
    <div className={`hover-lightable-icon ${className}`}>
      <div className="icon-default absolute inset-0 transition-opacity duration-300">
        {defaultIcon}
      </div>
      <div className="icon-hover absolute inset-0 transition-opacity duration-300">
        {hoverIcon}
      </div>
    </div>
  );
};
