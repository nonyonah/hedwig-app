import { Table } from '@heroui/react';
import { cn } from '@/lib/utils';

export interface EntityColumn<T> {
  key: string;
  label: string;
  className?: string;
  render: (item: T) => React.ReactNode;
}

export function EntityTable<T extends { id: string }>({
  columns,
  data,
  loading,
  onRowClick,
}: {
  columns: EntityColumn<T>[];
  data: T[];
  loading?: boolean;
  onRowClick?: (item: T) => void;
}) {
  return (
    <Table>
      <Table.ScrollContainer>
        <Table.Content aria-label="Data table">
          <Table.Header>
            {columns.map((col, idx) => (
              <Table.Column key={col.key} isRowHeader={idx === 0} className={cn('text-[11px] font-medium text-[var(--color-text-tertiary)]', col.className)}>
                {col.label}
              </Table.Column>
            ))}
          </Table.Header>
          <Table.Body>
            {loading ? (
              <Table.Row>
                <Table.Cell colSpan={columns.length}>Loading...</Table.Cell>
              </Table.Row>
            ) : data.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={columns.length}>No data</Table.Cell>
              </Table.Row>
            ) : (
              data.map((item) => (
                <Table.Row
                  key={item.id}
                  onClick={() => onRowClick?.(item)}
                  className={cn(onRowClick ? 'cursor-pointer hover:bg-[var(--color-background)]' : '')}
                >
                  {columns.map((col) => (
                    <Table.Cell key={col.key} className={cn('text-[13px]', col.className)}>
                      {col.render(item)}
                    </Table.Cell>
                  ))}
                </Table.Row>
              ))
            )}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}
