import { NextResponse } from 'next/server';
import { all, get } from '@/lib/db';

// Dashboard summary. The main dashboard page reads /api/deals directly for
// its per-stage detail; this endpoint keeps the roll-up counts around in
// case anything (email digest, future widgets) wants them.
export async function GET() {
  const dealsByStage = await all<{ stage: string; count: number }>(
    'SELECT stage, COUNT(*) as count FROM deals GROUP BY stage'
  );

  const totalPipeline = await get<{ total: number }>(
    `SELECT COALESCE(SUM(asking_price), 0) as total FROM deals WHERE stage != 'Dead' AND stage != 'Closed'`
  );

  const activeDeals = await get<{ count: number }>(
    `SELECT COUNT(*) as count FROM deals WHERE stage NOT IN ('Dead', 'Closed')`
  );

  const overdueTasks = await get<{ count: number }>(
    `SELECT COUNT(*) as count FROM tasks WHERE done = 0 AND due_date < date('now')`
  );

  const dueTodayTasks = await get<{ count: number }>(
    `SELECT COUNT(*) as count FROM tasks WHERE done = 0 AND due_date = date('now')`
  );

  const dueThreeDays = await get<{ count: number }>(
    `SELECT COUNT(*) as count FROM tasks WHERE done = 0 AND due_date BETWEEN date('now') AND date('now', '+3 days')`
  );

  const closedDeals = await get<{ count: number; total: number }>(
    `SELECT COUNT(*) as count, COALESCE(SUM(asking_price), 0) as total FROM deals WHERE stage = 'Closed'`
  );

  const underContract = await get<{ count: number }>(
    `SELECT COUNT(*) as count FROM deals WHERE stage = 'Under Contract'`
  );

  return NextResponse.json({
    dealsByStage,
    totalPipeline: Number(totalPipeline?.total || 0),
    activeDeals: Number(activeDeals?.count || 0),
    overdueTasks: Number(overdueTasks?.count || 0),
    dueTodayTasks: Number(dueTodayTasks?.count || 0),
    dueThreeDays: Number(dueThreeDays?.count || 0),
    closedDeals: {
      count: Number(closedDeals?.count || 0),
      total: Number(closedDeals?.total || 0),
    },
    underContract: Number(underContract?.count || 0),
  });
}
