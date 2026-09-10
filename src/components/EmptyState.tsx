import React from 'react';
import {
  StatePlaceholder,
  type StatePlaceholderProps,
} from './StatePlaceholder';

export type EmptyStateProps = Omit<StatePlaceholderProps, 'tone'>;

/** "Nothing here yet" placeholder for lists, searches and first-run screens. */
export function EmptyState({
  icon = '◌',
  testID = 'empty-state',
  ...rest
}: EmptyStateProps) {
  return (
    <StatePlaceholder tone="neutral" icon={icon} testID={testID} {...rest} />
  );
}
