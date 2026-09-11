import React from 'react';
import { View } from 'react-native';
import { AppButton, AppCard, AppText } from '@/components';
import type { DocumentClass, ExtractDocumentResult } from '@/services/api';
import { createStyles, useTheme } from '@/theme';

export const DOCUMENT_TYPE_LABELS: Record<DocumentClass, string> = {
  BUSINESS_CARD: 'Business card',
  RESUME: 'Résumé',
  INVOICE: 'Invoice',
  RECEIPT: 'Receipt',
  GENERIC: 'Document',
};

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  company: 'Company',
  designation: 'Designation',
  email: 'Email',
  phone: 'Phone',
  website: 'Website',
  address: 'Address',
  summary: 'Summary',
  skills: 'Skills',
  experience: 'Experience',
  education: 'Education',
  invoice_number: 'Invoice no.',
  vendor: 'Vendor',
  customer: 'Customer',
  date: 'Date',
  due_date: 'Due date',
  currency: 'Currency',
  subtotal: 'Subtotal',
  tax: 'Tax',
  total: 'Total',
  line_items: 'Line items',
  merchant: 'Merchant',
  time: 'Time',
  payment_method: 'Payment',
  items: 'Items',
  title: 'Title',
  key_values: 'Details',
  dates: 'Dates',
  amounts: 'Amounts',
  emails: 'Emails',
  phones: 'Phones',
};

const useStyles = createStyles(t => ({
  root: { gap: t.spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: {
    paddingHorizontal: t.spacing.sm,
    paddingVertical: t.spacing.xxs,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.primarySoft,
  },
  row: { flexDirection: 'row', gap: t.spacing.md, alignItems: 'flex-start' },
  key: { width: 96 },
  value: { flex: 1 },
  list: { flex: 1, gap: t.spacing.xxs },
  warning: { flexDirection: 'row', gap: t.spacing.xs },
  warningText: { flex: 1 },
}));

/** Human string for a leaf value; objects become "k: v" pairs. */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(formatValue).join(', ');
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `${FIELD_LABELS[k] ?? k}: ${formatValue(v)}`)
      .join(' · ');
  }
  return String(value);
}

/** Plain-text rendering used for Copy. */
export function fieldsToText(result: ExtractDocumentResult): string {
  const lines = [`${DOCUMENT_TYPE_LABELS[result.documentType]}`];
  for (const [key, value] of Object.entries(result.data)) {
    if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
      continue;
    }
    if (Array.isArray(value) && value.some(v => typeof v === 'object')) {
      lines.push(`${FIELD_LABELS[key] ?? key}:`);
      for (const item of value) {
        lines.push(`  - ${formatValue(item)}`);
      }
    } else {
      lines.push(`${FIELD_LABELS[key] ?? key}: ${formatValue(value)}`);
    }
  }
  return lines.join('\n');
}

interface ExtractedFieldsProps {
  result: ExtractDocumentResult;
  onCopy?: () => void;
  testID?: string;
}

/** Renders validated structured fields for any supported document type. */
export function ExtractedFields({ result, onCopy, testID = 'extracted-fields' }: ExtractedFieldsProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const entries = Object.entries(result.data);
  const filled = entries.filter(
    ([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0),
  );

  return (
    <AppCard variant="tinted" testID={testID}>
      <View style={styles.root}>
        <View style={styles.head}>
          <View style={styles.badge}>
            <AppText variant="caption" color="onPrimarySoft" testID={`${testID}-type`}>
              {DOCUMENT_TYPE_LABELS[result.documentType]} · {Math.round(result.confidence * 100)}%
            </AppText>
          </View>
          {onCopy ? (
            <AppButton title="Copy" variant="link" size="sm" onPress={onCopy} testID={`${testID}-copy`} />
          ) : null}
        </View>

        {filled.length === 0 ? (
          <AppText variant="bodySmall" color="textSecondary" testID={`${testID}-empty`}>
            No fields could be read from this text.
          </AppText>
        ) : (
          filled.map(([key, value]) => (
            <View key={key} style={styles.row} testID={`${testID}-field-${key}`}>
              <AppText variant="label" color="textSecondary" style={styles.key}>
                {FIELD_LABELS[key] ?? key}
              </AppText>
              {Array.isArray(value) && value.some(v => typeof v === 'object') ? (
                <View style={styles.list}>
                  {value.map((item, index) => (
                    <AppText key={index} variant="bodySmall" selectable>
                      • {formatValue(item)}
                    </AppText>
                  ))}
                </View>
              ) : (
                <AppText variant="body" style={styles.value} selectable>
                  {formatValue(value)}
                </AppText>
              )}
            </View>
          ))
        )}

        {result.warnings.map((warning, index) => (
          <View key={index} style={styles.warning} testID={`${testID}-warning`}>
            <AppText variant="caption" style={{ color: colors.warning }}>
              !
            </AppText>
            <AppText variant="caption" color="textMuted" style={styles.warningText}>
              {warning}
            </AppText>
          </View>
        ))}

        <AppText variant="caption" color="textMuted" testID={`${testID}-meta`}>
          {result.modelName} · {result.processingMs} ms
        </AppText>
      </View>
    </AppCard>
  );
}
