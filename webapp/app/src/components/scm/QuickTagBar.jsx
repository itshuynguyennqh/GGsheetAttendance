import { memo, useMemo } from 'react';
import { Box, Chip, Badge, Typography, Skeleton } from '@mui/material';

const TYPE_COLORS = {
  positive: 'success',
  negative: 'error',
  neutral: 'default',
};

function QuickTagBar({ tags = [], summary = [], onTagTap, loading }) {
  const countByTag = useMemo(() => {
    const map = {};
    summary.forEach((s) => {
      map[s.tagId] = s.count || 0;
    });
    return map;
  }, [summary]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', py: 1 }}>
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} variant="rounded" width={100} height={32} />
        ))}
      </Box>
    );
  }

  if (tags.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
        Chưa có tag nhanh. Vào cài đặt để tạo tag.
      </Typography>
    );
  }

  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', py: 1 }}>
      {tags.map((tag) => {
        const count = countByTag[tag.id] || 0;
        return (
          <Badge key={tag.id} badgeContent={count} color="primary" overlap="rectangular">
            <Chip
              label={`${tag.icon || ''} ${tag.label}`.trim()}
              onClick={() => onTagTap?.(tag.id)}
              color={TYPE_COLORS[tag.type] || 'default'}
              variant={count > 0 ? 'filled' : 'outlined'}
              sx={{
                fontWeight: count > 0 ? 600 : 400,
                cursor: 'pointer',
                minWidth: 80,
                '&:active': { transform: 'scale(0.95)' },
              }}
            />
          </Badge>
        );
      })}
    </Box>
  );
}

export default memo(QuickTagBar);
