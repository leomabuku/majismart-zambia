import React from 'react';

export default function BrandMark({ size = 40, decorative = false }) {
  return <img src="/logo.svg" width={size} height={size} className="brand-mark" alt={decorative ? '' : 'SmartWater Zambia'} />;
}
