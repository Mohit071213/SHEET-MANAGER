import React from 'react';
import { CheckCircle2, Clock3, Trash2 } from 'lucide-react';
import { CallRecord, EXACT_EXCEL_HEADERS } from '../types/callsheet';

interface SpreadsheetTableProps {
  records: CallRecord[];
  emptyMessage?: string;
  showExcelColumnLetters?: boolean;
  compactMobileCards?: boolean;
  onDeleteRecord?: (recordId: string) => void;
}

const EXCEL_COL_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

export const SpreadsheetTable: React.FC<SpreadsheetTableProps> = ({
  records,
  emptyMessage = 'No records to display yet.',
  showExcelColumnLetters = true,
  compactMobileCards = true,
  onDeleteRecord,
}) => {
  if (records.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <p className="text-sm font-medium text-slate-600">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {compactMobileCards && (
        <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white md:hidden">
          {records.map((rec) => (
            <div key={rec.id} className="p-3.5 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-mono text-sm font-semibold text-slate-900 tabular-nums">
                    <span>{rec.mobileNo || 'No Mobile'}</span>
                    <span className="text-slate-300" aria-hidden="true">·</span>
                    <span className="text-xs font-medium text-slate-600">
                      S ID: {rec.serialId}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    <span className="font-mono tabular-nums">{rec.date}</span>
                    {(rec.category || rec.subcategory) && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">
                          {[rec.category, rec.subcategory].filter(Boolean).join(' / ')}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {rec.status === 'Resolved' ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#166534]">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Resolved
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#B45309]">
                      <Clock3 className="h-3.5 w-3.5" />
                      Unresolved
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-lg bg-[#F8FAFC] px-2.5 py-1.5 text-xs text-slate-700 border border-slate-200/70">
                <span className="font-medium text-slate-500">Col 9 Remark: </span>
                <span className="font-mono">{rec.remark}</span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                <span>
                  Row #{rec.rowIndex} · {rec.escalations} · {rec.channels} · {rec.names}
                </span>
                <div className="flex items-center gap-2">
                  {(rec.isDuplicateMobile || rec.isDuplicateSerial) && (
                    <span className="font-medium text-[#B45309]">
                      Duplicate kept as separate row
                    </span>
                  )}
                  {rec.source === 'added' && onDeleteRecord && (
                    <button
                      type="button"
                      onClick={() => onDeleteRecord(rec.id)}
                      className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100 whitespace-nowrap"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>Remove</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        className={`overflow-x-auto rounded-xl border border-slate-300 bg-white ${
          compactMobileCards ? 'hidden md:block' : 'block'
        }`}
      >
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            {showExcelColumnLetters && (
              <tr className="bg-[#F1F5F9] border-b border-slate-300 text-[11px] font-mono text-slate-500">
                <th className="w-12 border-r border-slate-300 px-2 py-1 text-center font-normal">
                  #
                </th>
                {EXCEL_COL_LETTERS.map((letter) => (
                  <th
                    key={letter}
                    className="border-r border-slate-300 px-2.5 py-1 text-center font-medium last:border-r-0"
                  >
                    {letter}
                  </th>
                ))}
                {onDeleteRecord && (
                  <th className="border-l border-slate-300 px-2 py-1 text-center font-normal">
                    —
                  </th>
                )}
              </tr>
            )}
            <tr className="bg-[#E2EFDA] border-b border-slate-300 text-[#0F172A]">
              <th className="w-12 border-r border-slate-300 px-2 py-2 text-center font-mono text-[11px] text-slate-600">
                Row
              </th>
              {EXACT_EXCEL_HEADERS.map((header, idx) => (
                <th
                  key={`${header}-${idx}`}
                  className="border-r border-slate-300 px-3 py-2 font-semibold whitespace-nowrap last:border-r-0"
                  title={
                    idx === 8
                      ? 'Column 9 keeps header "Serial id" for Remarks/Call Details'
                      : header
                  }
                >
                  {header}
                  {idx === 8 && (
                    <span className="ml-1 text-[10px] font-normal text-slate-600">
                      (Remarks)
                    </span>
                  )}
                </th>
              ))}
              {onDeleteRecord && (
                <th className="border-l border-slate-300 px-2.5 py-2 text-center font-semibold whitespace-nowrap">
                  Action
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {records.map((rec) => (
              <tr
                key={rec.id}
                className={`transition-colors hover:bg-slate-50 ${
                  rec.source === 'added' ? 'bg-[#F0FDF4]/40' : 'bg-white'
                }`}
              >
                <td className="border-r border-slate-200 px-2 py-2 text-center font-mono text-[11px] text-slate-500 tabular-nums">
                  {rec.rowIndex}
                </td>
                <td className="border-r border-slate-200 px-3 py-2 font-mono text-slate-800 whitespace-nowrap tabular-nums">
                  {rec.date}
                </td>
                <td className="border-r border-slate-200 px-3 py-2 font-mono text-slate-800 whitespace-nowrap tabular-nums">
                  {rec.serialId}
                </td>
                <td className="border-r border-slate-200 px-3 py-2 font-mono font-medium text-slate-900 whitespace-nowrap tabular-nums">
                  {rec.mobileNo}
                  {rec.isDuplicateMobile && (
                    <span className="ml-1.5 text-[10px] font-sans font-semibold text-[#B45309]">
                      (Dup)
                    </span>
                  )}
                </td>
                <td className="border-r border-slate-200 px-3 py-2 text-slate-700 whitespace-nowrap">
                  {rec.category || '—'}
                </td>
                <td className="border-r border-slate-200 px-3 py-2 text-slate-700 whitespace-nowrap">
                  {rec.subcategory || '—'}
                </td>
                <td className="border-r border-slate-200 px-3 py-2 whitespace-nowrap">
                  {rec.status === 'Resolved' ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-[#166534]">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Resolved
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-semibold text-[#B45309]">
                      <Clock3 className="h-3.5 w-3.5" />
                      Unresolved
                    </span>
                  )}
                </td>
                <td className="border-r border-slate-200 px-3 py-2 text-slate-600 whitespace-nowrap">
                  {rec.escalations}
                </td>
                <td className="border-r border-slate-200 px-3 py-2 text-slate-600 whitespace-nowrap">
                  {rec.channels}
                </td>
                <td className="border-r border-slate-200 px-3 py-2 text-slate-900 max-w-[260px] truncate" title={rec.remark}>
                  {rec.remark}
                </td>
                <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                  {rec.names}
                </td>
                {onDeleteRecord && (
                  <td className="border-l border-slate-200 px-2 py-1.5 text-center whitespace-nowrap">
                    {rec.source === 'added' ? (
                      <button
                        type="button"
                        onClick={() => onDeleteRecord(rec.id)}
                        aria-label={`Remove added row ${rec.rowIndex}`}
                        title="Remove added row"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-400">Master</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
