import { memo, useCallback, useMemo } from 'react';
import { Box, Typography, Chip, Tooltip } from '@mui/material';
import { hasAttendanceRecord } from '../../utils/attendanceRecord';

const STATUS_COLORS = {
  empty: { bgcolor: 'grey.100', borderColor: 'grey.300' },
  assigned: { bgcolor: '#e8f5e9', borderColor: '#66bb6a' },
  pending: { bgcolor: '#fff8e1', borderColor: '#ffa726' },
  mismatch: { bgcolor: '#ffebee', borderColor: '#ef5350' },
  selected: { bgcolor: '#e3f2fd', borderColor: '#42a5f5' },
  disabled: { bgcolor: 'grey.200', borderColor: 'grey.400', opacity: 0.5 },
  pickTarget: { bgcolor: '#e3f2fd', borderColor: '#1976d2', borderStyle: 'dashed' },
  pickedHere: { bgcolor: '#bbdefb', borderColor: '#1565c0' },
};

function SeatCell({
  row, col, student, status = 'empty', attendanceRecord, order, isPathSelected,
  isPickTarget, isPickedHere, onTap, disabled,
}) {
  const isGuest = !!student?.isSessionGuest;
  const attendanceMarked = useMemo(
    () => hasAttendanceRecord(attendanceRecord),
    [attendanceRecord]
  );
  const attVal = String(attendanceRecord?.value || '').trim().toUpperCase();
  const colors = disabled ? STATUS_COLORS.disabled
    : isPickedHere ? STATUS_COLORS.pickedHere
    : isPathSelected ? STATUS_COLORS.selected
    : isPickTarget ? STATUS_COLORS.pickTarget
    : isGuest && status === 'assigned'
      ? { bgcolor: 'secondary.light', borderColor: 'secondary.dark' }
    : STATUS_COLORS[status] || STATUS_COLORS.empty;

  const handleClick = useCallback(() => {
    if (disabled) return;
    onTap?.({ row, col, student });
  }, [disabled, onTap, row, col, student]);

  return (
    <Box
      onClick={handleClick}
      sx={{
        border: '2px solid',
        ...colors,
        borderRadius: 1.5,
        minHeight: 56,
        minWidth: 56,
        p: 0.5,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative',
        transition: 'all 0.15s ease',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        '&:hover': disabled ? {} : {
          transform: 'scale(1.03)',
          boxShadow: 2,
        },
        '&:active': disabled ? {} : {
          transform: 'scale(0.97)',
        },
        ...(isPickTarget ? {
          animation: 'pulse 1.5s ease-in-out infinite',
          '@keyframes pulse': {
            '0%, 100%': { boxShadow: '0 0 0 0 rgba(25, 118, 210, 0.3)' },
            '50%': { boxShadow: '0 0 0 4px rgba(25, 118, 210, 0.15)' },
          },
        } : {}),
        ...(status === 'mismatch' ? {
          animation: 'blink 1s ease-in-out infinite',
          '@keyframes blink': {
            '0%, 100%': { opacity: 1 },
            '50%': { opacity: 0.5 },
          },
        } : {}),
      }}
    >
      {order != null && (
        <Box
          sx={{
            position: 'absolute',
            top: -8,
            left: -8,
            width: 22,
            height: 22,
            borderRadius: '50%',
            bgcolor: 'primary.main',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 700,
            zIndex: 1,
          }}
        >
          {order}
        </Box>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
        R{row + 1}C{col + 1}
      </Typography>
      {student ? (
        <Tooltip
          title={
            (isGuest ? `${student.hoTen || student.name || ''} · Lớp khách` : `${student.hoTen || student.name || ''}`)
            + (attendanceMarked ? ` · Điểm danh${attVal ? `: ${attVal}` : ' (ghi chú)'}` : '')
          }
          placement="top"
        >
          <Chip
            label={
              attVal
                ? `${student.hoTen || student.name || `HV ${student.id}`} · ${attVal}`
                : (attendanceMarked
                  ? `${student.hoTen || student.name || `HV ${student.id}`} · ✓`
                  : (student.hoTen || student.name || `HV ${student.id}`))
            }
            size="small"
            sx={{
              maxWidth: '100%',
              fontSize: 11,
              height: 24,
              bgcolor: isPickedHere ? 'primary.main'
                : status === 'mismatch' ? 'error.light'
                : attendanceMarked ? 'success.light'
                : isGuest ? 'secondary.light'
                : 'primary.light',
              color: isPickedHere ? 'primary.contrastText'
                : status === 'mismatch' ? 'error.contrastText'
                : attendanceMarked ? 'success.dark'
                : isGuest ? 'secondary.contrastText'
                : 'primary.contrastText',
              fontWeight: isPickedHere || attendanceMarked ? 700 : 400,
              boxShadow: isPickedHere ? 3 : 0,
            }}
          />
        </Tooltip>
      ) : isPickTarget ? (
        <Typography variant="caption" color="primary" sx={{ fontSize: 11, fontWeight: 600 }}>
          Chạm gán
        </Typography>
      ) : (
        <Typography variant="caption" color="text.disabled" sx={{ fontSize: 11 }}>
          Trống
        </Typography>
      )}
    </Box>
  );
}

export default memo(SeatCell);
