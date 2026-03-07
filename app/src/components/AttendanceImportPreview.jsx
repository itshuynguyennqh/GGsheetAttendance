import React from 'react';
import {
  Box,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Typography,
  Tooltip,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

const statusConfig = {
  valid: { label: 'Hợp lệ', color: 'success', Icon: CheckCircleOutlineIcon },
  warning: { label: 'Cảnh báo', color: 'warning', Icon: WarningAmberIcon },
  error: { label: 'Lỗi', color: 'error', Icon: ErrorOutlineIcon },
};

function StatusBadge({ status }) {
  const config = statusConfig[status] || statusConfig.error;
  const Icon = config.Icon;
  return (
    <Chip
      size="small"
      icon={<Icon sx={{ fontSize: 16 }} />}
      label={config.label}
      color={config.color}
      variant="outlined"
    />
  );
}

function cellBg(value) {
  const v = (value || '').toUpperCase();
  if (v === 'M' || v === 'B') return 'primary.light'; // Xanh nước biển
  if (v === 'P') return 'error.light'; // Đỏ
  if (v === 'X') return 'success.light'; // Xanh lá (có mặt)
  return 'grey.100';
}

/** Trả về [year, month] để so sánh; "__other__" → [9999, 99] để đẩy xuống cuối. */
function thangSortKey(thang) {
  if (!thang || thang === '__other__') return [9999, 99];
  const parts = String(thang).trim().split('.');
  const month = parseInt(parts[0], 10) || 0;
  const year = parseInt(parts[1], 10) || 0;
  return [year, month];
}

export default function AttendanceImportPreview({
  data = [],
  attendanceCols = [],
  filterStatus = 'all',
  searchText = '',
  selectedRows = new Set(),
  onSelectRow,
  onSelectAll,
  maxHeight = 400,
}) {
  const filtered = data.filter((row) => {
    if (filterStatus !== 'all' && row.status !== filterStatus) return false;
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      if (!(row.maHV || '').toLowerCase().includes(q) && !(row.hoTen || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const allSelected = filtered.length > 0 && filtered.every((r) => selectedRows.has(r.rowIndex));
  const someSelected = filtered.some((r) => selectedRows.has(r.rowIndex));

  // Thang cho từng cột (cột fromCell: lấy từ bất kỳ dòng nào có records[i].thang).
  const thangByIndex = React.useMemo(() => {
    const out = [];
    for (let i = 0; i < attendanceCols.length; i++) {
      const col = attendanceCols[i];
      let thang = col.thang || null;
      if (col.fromCell) {
        thang = thang || (data[0]?.records?.[i]?.thang) || null;
        if (!thang && Array.isArray(data)) {
          for (let r = 0; r < data.length; r++) {
            const t = data[r]?.records?.[i]?.thang;
            if (t) {
              thang = t;
              break;
            }
          }
        }
      }
      out[i] = thang ?? '__other__';
    }
    return out;
  }, [attendanceCols, data]);

  // Sắp xếp cột theo tháng (M.YYYY) rồi nhóm liên tiếp → tháng không bị tách, đúng thứ tự.
  const { monthGroups, sortedColumnIndices } = React.useMemo(() => {
    const indices = Array.from({ length: attendanceCols.length }, (_, i) => i);
    indices.sort((a, b) => {
      const [ya, ma] = thangSortKey(thangByIndex[a]);
      const [yb, mb] = thangSortKey(thangByIndex[b]);
      if (ya !== yb) return ya - yb;
      if (ma !== mb) return ma - mb;
      return a - b;
    });
    const groups = [];
    let lastKey = null;
    for (const i of indices) {
      const key = thangByIndex[i];
      if (key !== lastKey) {
        lastKey = key;
        groups.push({
          thang: key === '__other__' ? '' : key,
          label: key === '__other__' ? 'Buổi' : `Tháng ${key}`,
          cols: [],
        });
      }
      groups[groups.length - 1].cols.push({ col: attendanceCols[i], index: i });
    }
    return { monthGroups: groups, sortedColumnIndices: indices };
  }, [attendanceCols, thangByIndex]);

  const getBuoiLabel = (col, i) => {
    if (col.buoi != null) return `B${col.buoi}`;
    const rec = data[0]?.records?.[i];
    if (rec?.buoi != null) return `B${rec.buoi}`;
    return `B${i + 1}`;
  };

  // Map từ origIdx → vị trí trong nhóm tháng (để đếm lại từ 1 cho mỗi tháng)
  const buoiInMonthByIndex = React.useMemo(() => {
    const map = new Map();
    let globalPos = 0;
    for (const grp of monthGroups) {
      let posInGroup = 0;
      for (const { index: origIdx } of grp.cols) {
        map.set(origIdx, posInGroup + 1);
        posInGroup++;
        globalPos++;
      }
    }
    return map;
  }, [monthGroups]);

  // Set các cột đầu và cuối của mỗi nhóm tháng (để thêm border phân tách)
  const { firstColsInGroup, lastColsInGroup } = React.useMemo(() => {
    const first = new Set();
    const last = new Set();
    for (const grp of monthGroups) {
      if (grp.cols.length > 0) {
        first.add(grp.cols[0].index);
        last.add(grp.cols[grp.cols.length - 1].index);
      }
    }
    return { firstColsInGroup: first, lastColsInGroup: last };
  }, [monthGroups]);

  return (
    <TableContainer component={Paper} sx={{ maxHeight }}>
      <Table size="small" stickyHeader>
        <TableHead sx={{ contain: 'layout' }}>
          <TableRow sx={{ bgcolor: 'primary.light' }}>
            <TableCell padding="checkbox" rowSpan={3} sx={{ verticalAlign: 'middle' }}>
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected && !allSelected}
                onChange={(e) => onSelectAll?.(e.target.checked, filtered.map((r) => r.rowIndex))}
              />
            </TableCell>
            <TableCell rowSpan={3} sx={{ fontWeight: 600, verticalAlign: 'middle' }}>STT</TableCell>
            <TableCell rowSpan={3} sx={{ fontWeight: 600, verticalAlign: 'middle' }}>Mã HV</TableCell>
            <TableCell rowSpan={3} sx={{ fontWeight: 600, verticalAlign: 'middle' }}>Họ tên</TableCell>
            <TableCell rowSpan={3} sx={{ fontWeight: 600, verticalAlign: 'middle' }}>Lớp</TableCell>
            {monthGroups.map((grp, gi) => {
              const isFirstGroup = gi === 0;
              const isLastGroup = gi === monthGroups.length - 1;
              const firstColIdx = grp.cols[0]?.index;
              const lastColIdx = grp.cols[grp.cols.length - 1]?.index;
              return (
                <TableCell
                  key={gi}
                  align="center"
                  colSpan={grp.cols.length}
                  sx={{
                    fontWeight: 600,
                    borderLeft: isFirstGroup ? 'none' : '2px solid',
                    borderRight: isLastGroup ? 'none' : '2px solid',
                    borderColor: 'divider',
                  }}
                >
                  {grp.label}
                </TableCell>
              );
            })}
            <TableCell rowSpan={3} sx={{ fontWeight: 600, verticalAlign: 'middle' }}>Trạng thái</TableCell>
          </TableRow>
          <TableRow sx={{ bgcolor: 'primary.light' }}>
            {sortedColumnIndices.map((origIdx, displayPos) => {
              const col = attendanceCols[origIdx];
              const buoiInMonth = buoiInMonthByIndex.get(origIdx) ?? displayPos + 1;
              const isFirstInGroup = firstColsInGroup.has(origIdx);
              const isLastInGroup = lastColsInGroup.has(origIdx);
              const isFirstCol = displayPos === 0;
              const isLastCol = displayPos === sortedColumnIndices.length - 1;
              return (
                <TableCell
                  key={col.colIndex ?? origIdx}
                  align="center"
                  sx={{
                    fontWeight: 600,
                    borderLeft: isFirstCol ? 'none' : isFirstInGroup ? '2px solid' : 'none',
                    borderRight: isLastCol ? 'none' : isLastInGroup ? '2px solid' : 'none',
                    borderColor: 'divider',
                  }}
                >
                  B{buoiInMonth}
                </TableCell>
              );
            })}
          </TableRow>
          <TableRow sx={{ bgcolor: 'primary.light' }}>
            {sortedColumnIndices.map((origIdx, displayPos) => {
              const isFirstInGroup = firstColsInGroup.has(origIdx);
              const isLastInGroup = lastColsInGroup.has(origIdx);
              const isFirstCol = displayPos === 0;
              const isLastCol = displayPos === sortedColumnIndices.length - 1;
              return (
                <TableCell
                  key={`cumul-${origIdx}`}
                  align="center"
                  sx={{
                    borderLeft: isFirstCol ? 'none' : isFirstInGroup ? '2px solid' : 'none',
                    borderRight: isLastCol ? 'none' : isLastInGroup ? '2px solid' : 'none',
                    borderColor: 'divider',
                  }}
                >
                  {displayPos + 1}
                </TableCell>
              );
            })}
          </TableRow>
        </TableHead>
        <TableBody>
          {filtered.map((row) => (
            <TableRow
              key={row.rowIndex}
              hover
              sx={{
                bgcolor: row.status === 'error' ? 'error.light' : row.status === 'warning' ? 'warning.light' : undefined,
              }}
            >
              <TableCell padding="checkbox">
                <Checkbox
                  checked={selectedRows.has(row.rowIndex)}
                  onChange={(e) => onSelectRow?.(row.rowIndex, e.target.checked)}
                />
              </TableCell>
              <TableCell>{row.rowIndex}</TableCell>
              <TableCell>{row.maHV || '—'}</TableCell>
              <TableCell>{row.hoTen || '—'}</TableCell>
              <TableCell>{row.className ?? '—'}</TableCell>
              {sortedColumnIndices.map((origIdx) => {
                const col = attendanceCols[origIdx];
                // For long format, find the record matching this column's thang and buoi
                let rec = null;
                if (col && col.thang && col.buoi != null) {
                  rec = (row.records || []).find(r => r.thang === col.thang && r.buoi === col.buoi);
                } else {
                  // Fallback to index-based access for backward compatibility
                  rec = (row.records || [])[origIdx];
                }
                return (
                  <TableCell key={origIdx} align="center" sx={{ bgcolor: cellBg(rec?.value), minWidth: 48 }}>
                    <Tooltip title={rec?.session ? `Ngày học: ${rec.session.ngayHoc}` : rec?.thang ? `${rec.thang}-B${rec.buoi}` : ''}>
                      <Box component="span" sx={{ fontWeight: 600 }}>{rec?.value ?? '—'}</Box>
                    </Tooltip>
                  </TableCell>
                );
              })}
              <TableCell>
                <StatusBadge status={row.status} />
                {row.errors?.length > 0 && (
                  <Tooltip title={row.errors.join('; ')}>
                    <Box component="span" sx={{ ml: 0.5, cursor: 'help' }}>ⓘ</Box>
                  </Tooltip>
                )}
                {row.warnings?.length > 0 && (
                  <Tooltip title={row.warnings.join('\n')}>
                    <Box component="span" sx={{ ml: 0.5, cursor: 'help' }}>⚠</Box>
                  </Tooltip>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {filtered.length === 0 && (
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">Không có dòng nào phù hợp bộ lọc.</Typography>
        </Box>
      )}
    </TableContainer>
  );
}
