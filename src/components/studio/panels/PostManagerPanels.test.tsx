import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PostManagerFilterBar } from './PostManagerFilterBar.tsx';
import { PostManagerCalendarView } from './PostManagerCalendarView.tsx';
import { PostManagerBulkScheduleView } from './PostManagerBulkScheduleView.tsx';
import type { SavedPostRecord } from '../../../types.ts';
import { DEFAULT_STARTER_DECK } from '../../../lib/presets.ts';

const mockPost: SavedPostRecord = {
  id: 'post-1',
  title: 'High-Concurrency PostgreSQL Architectures',
  category: 'DATABASE',
  creatorHandle: '@marrok',
  slideCount: 5,
  qaPassed: true,
  createdAt: '2026-11-20T10:00:00Z',
  updatedAt: '2026-11-20T10:00:00Z',
  postStatus: 'validated',
  deck: {
    ...DEFAULT_STARTER_DECK,
    id: 'deck-1',
    category: 'DATABASE',
    sourceMeta: {
      userReviewed: true,
      verifiedNumbers: true,
    },
  },
  humanApproved: true,
  verifiedNumbers: true,
};

describe('PostManager Subcomponents', () => {
  describe('PostManagerFilterBar', () => {
    it('renders search input, filter tabs, and triggers view mode switches', () => {
      const setViewMode = vi.fn();
      const setStatusTab = vi.fn();
      const setSearchQuery = vi.fn();
      const setDraftReadinessFilter = vi.fn();
      const onSelectBulkMode = vi.fn();

      render(
        <PostManagerFilterBar
          mode="schedule"
          viewMode="list"
          setViewMode={setViewMode}
          statusTab="scheduled"
          setStatusTab={setStatusTab}
          counts={{ all: 10, draft: 5, scheduled: 3, posted: 2, attention: 0 }}
          draftReadinessFilter="all"
          setDraftReadinessFilter={setDraftReadinessFilter}
          draftAndReviewCount={5}
          draftNeedsReviewCount={1}
          reviewedReadyDraftsCount={4}
          searchQuery=""
          setSearchQuery={setSearchQuery}
          selectedBulkIdsCount={0}
          importInputRef={{ current: null }}
          cadenceOverloadDays={[]}
          onSelectBulkMode={onSelectBulkMode}
        />
      );

      expect(screen.getByText(/Queue \(3\)/)).toBeDefined();
      expect(screen.getByText(/Calendar \(7\/14d\)/)).toBeDefined();

      // Click calendar button
      fireEvent.click(screen.getByText(/Calendar \(7\/14d\)/));
      expect(setViewMode).toHaveBeenCalledWith('calendar');

      // Click bulk schedule button
      fireEvent.click(screen.getByText(/Bulk Schedule/));
      expect(onSelectBulkMode).toHaveBeenCalled();
    });

    it('renders cadence overload warning when present', () => {
      render(
        <PostManagerFilterBar
          mode="schedule"
          viewMode="list"
          setViewMode={vi.fn()}
          statusTab="scheduled"
          setStatusTab={vi.fn()}
          counts={{ all: 10, draft: 5, scheduled: 3, posted: 2, attention: 0 }}
          draftReadinessFilter="all"
          setDraftReadinessFilter={vi.fn()}
          draftAndReviewCount={5}
          draftNeedsReviewCount={1}
          reviewedReadyDraftsCount={4}
          searchQuery=""
          setSearchQuery={vi.fn()}
          selectedBulkIdsCount={0}
          importInputRef={{ current: null }}
          cadenceOverloadDays={[{ datePart: '2026-11-22', count: 3 }]}
          onSelectBulkMode={vi.fn()}
        />
      );

      expect(screen.getByTestId('cadence-overload-warning')).toBeDefined();
      expect(screen.getByText(/2026-11-22 has 3 posts/)).toBeDefined();
    });
  });

  describe('PostManagerCalendarView', () => {
    it('renders day columns and allows toggling 7/14 days view', () => {
      const setCalendarDaysCount = vi.fn();
      const onEditInStudio = vi.fn();

      render(
        <PostManagerCalendarView
          calendarDaysCount={7}
          setCalendarDaysCount={setCalendarDaysCount}
          calendarDays={[
            {
              dateStr: '2026-11-21',
              dayLabel: 'Today',
              subLabel: 'Nov 21',
              isToday: true,
              items: [{ post: mockPost, stage: 'scheduled', timeShort: '18:00' }],
            },
          ]}
          onEditInStudio={onEditInStudio}
          onReschedule={vi.fn()}
          onUnscheduleToDraft={vi.fn()}
          assigningDateStr={null}
          setAssigningDateStr={vi.fn()}
          reviewedReadyDrafts={[mockPost]}
          onAssignDraft={vi.fn()}
        />
      );

      expect(screen.getByText('Today')).toBeDefined();
      expect(screen.getByText('18:00')).toBeDefined();
      expect(screen.getByText('High-Concurrency PostgreSQL Architectures')).toBeDefined();

      fireEvent.click(screen.getByText('14 Days'));
      expect(setCalendarDaysCount).toHaveBeenCalledWith(14);
    });
  });

  describe('PostManagerBulkScheduleView', () => {
    it('renders verified drafts and allows selecting them for bulk scheduling', () => {
      const setSelectedBulkIds = vi.fn();
      const onApplyBulkSchedule = vi.fn();

      render(
        <PostManagerBulkScheduleView
          bulkStartDate="2026-11-22"
          setBulkStartDate={vi.fn()}
          bulkCadence="daily"
          setBulkCadence={vi.fn()}
          bulkTimeStr="18:00"
          setBulkTimeStr={vi.fn()}
          reviewedReadyDrafts={[mockPost]}
          selectedBulkIds={['post-1']}
          setSelectedBulkIds={setSelectedBulkIds}
          bulkSlots={[{ datePart: '2026-11-22', timePart: '18:00:00' }]}
          isBulkBusy={false}
          onApplyBulkSchedule={onApplyBulkSchedule}
        />
      );

      expect(screen.getByText('High-Concurrency PostgreSQL Architectures')).toBeDefined();
      expect(screen.getByText(/Schedule 1 Verified Draft\(s\)/)).toBeDefined();

      fireEvent.click(screen.getByText(/Schedule 1 Verified Draft\(s\)/));
      expect(onApplyBulkSchedule).toHaveBeenCalled();
    });
  });
});
