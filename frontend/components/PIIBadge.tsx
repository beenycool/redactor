import React from 'react';

type PIIType =
  | 'PERSON'
  | 'SSN'
  | 'EMAIL'
  | 'ADDRESS'
  | 'PHONE'
  | 'CREDIT_CARD'
  | 'DOB'
  | 'IP_ADDRESS'
  | 'PASSPORT'
  | 'DRIVER_LICENSE'
  | 'UNKNOWN';

const PIITypeColors: Record<string, string> = {
  PERSON: 'bg-blue-100 text-blue-800',
  SSN: 'bg-red-100 text-red-800',
  EMAIL: 'bg-green-100 text-green-800',
  ADDRESS: 'bg-purple-100 text-purple-800',
  PHONE: 'bg-yellow-100 text-yellow-800',
  CREDIT_CARD: 'bg-pink-100 text-pink-800',
  DOB: 'bg-orange-100 text-orange-800',
  IP_ADDRESS: 'bg-teal-100 text-teal-800',
  PASSPORT: 'bg-indigo-100 text-indigo-800',
  DRIVER_LICENSE: 'bg-cyan-100 text-cyan-800',
};

const defaultBadgeClasses =
  'bg-gray-100 text-gray-800';

// Exported helper to get the CSS classes for a given PII type
export function getPIITypeClass(type: string): string {
  return PIITypeColors[type] ?? defaultBadgeClasses;
}

export interface PIIBadgeProps {
  type: PIIType;
  className?: string;
  titleCase?: boolean;
}

export default function PIIBadge({ type, className = '', titleCase = true }: PIIBadgeProps) {
  const classes = getPIITypeClass(type);

  const label = titleCase
    ? String(type).replace(/[_-]+/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())
    : String(type);

  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ring-black/5 ${classes} ${className}`}
    >
      {label}
    </span>
  );
}