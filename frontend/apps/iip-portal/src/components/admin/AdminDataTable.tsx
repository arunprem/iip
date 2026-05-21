import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
}

interface AdminDataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyField: (row: T) => string;
  isLoading?: boolean;
  emptyMessage?: string;
}

export function AdminDataTable<T>({
  columns,
  data,
  keyField,
  isLoading,
  emptyMessage = 'No records found.',
}: AdminDataTableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-iip-border bg-iip-bg/50 text-left">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 font-medium text-iip-text-muted ${col.className ?? ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-iip-text-muted">
                Loading...
              </td>
            </tr>
          )}
          {!isLoading && data.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-iip-text-muted">
                {emptyMessage}
              </td>
            </tr>
          )}
          {!isLoading &&
            data.map((row) => (
              <tr key={keyField(row)} className="border-b border-iip-border/80 last:border-0">
                {columns.map((col) => (
                  <td key={col.key} className={`px-4 py-3 ${col.className ?? ''}`}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
