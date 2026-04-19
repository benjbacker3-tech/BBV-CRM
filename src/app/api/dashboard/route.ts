import { NextResponse } from 'next/server';
import { all, get } from '@/lib/db';

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

  const investorStats = await get<{ total_investors: number; total_commitment: number; total_called: number; active_investors: number }>(
    `SELECT
       COUNT(*) as total_investors,
       COALESCE(SUM(commitment), 0) as total_commitment,
       COALESCE(SUM(called), 0) as total_called,
       COUNT(CASE WHEN status = 'Active' THEN 1 END) as active_investors
     FROM investors`
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
    investorStats: {
      total_investors: Number(investorStats?.total_investors || 0),
      total_commitment: Number(investorStats?.total_commitment || 0),
      total_called: Number(investorStats?.total_called || 0),
      active_investors: Number(investorStats?.active_investors || 0),
    },
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
