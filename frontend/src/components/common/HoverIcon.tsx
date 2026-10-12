import React from 'react';

export interface HoverIconProps {
  defaultIcon?: React.ReactNode;
  hoverIcon?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  defaultClassName?: string;
  hoverClassName?: string;
  children?: React.ReactNode;
}

export const HoverIcon: React.FC<HoverIconProps> = ({
  defaultIcon,
  hoverIcon,
  icon,
  className = "w-5 h-5",
  defaultClassName = "",
  hoverClassName = "",
  children,
}) => {
  const baseIcon = defaultIcon || icon || children;
  const activeHoverIcon = hoverIcon || icon || children;

  // Dual explicit icons (Cross-fading between distinct icons)
  if (defaultIcon && hoverIcon) {
    return (
      <div className={`hover-lightable-icon ${className}`}>
        <div className={`icon-default absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${defaultClassName}`}>
          {defaultIcon}
        </div>
        <div className={`icon-hover absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${hoverClassName}`}>
          {hoverIcon}
        </div>
      </div>
    );
  }

  // Single icon with custom default & hover classes (e.g. muted to luminous)
  if (baseIcon && (defaultClassName || hoverClassName)) {
    return (
      <div className={`hover-lightable-icon ${className}`}>
        <div className={`icon-default absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${defaultClassName}`}>
          {baseIcon}
        </div>
        <div className={`icon-hover absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${hoverClassName}`}>
          {activeHoverIcon}
        </div>
      </div>
    );
  }

  // Single icon default illumination
  return (
    <div className={`hover-lightable-icon single-icon ${className}`}>
      <div className="icon-default absolute inset-0 flex items-center justify-center transition-opacity duration-300">
        {baseIcon}
      </div>
      <div className="icon-hover absolute inset-0 flex items-center justify-center transition-opacity duration-300 text-amber-300">
        {activeHoverIcon}
      </div>
    </div>
  );
};

export default HoverIcon;
