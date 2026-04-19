import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = getDb();

  const dealsByStage = db.prepare(`
    SELECT stage, COUNT(*) as count FROM deals GROUP BY stage
  `).all() as { stage: string; count: number }[];

  const totalPipeline = db.prepare(`
    SELECT COALESCE(SUM(asking_price), 0) as total FROM deals WHERE stage != 'Dead' AND stage != 'Closed'
  `).get() as { total: number };

  const activeDeals = db.prepare(`
    SELECT COUNT(*) as count FROM deals WHERE stage NOT IN ('Dead', 'Closed')
  `).get() as { count: number };

  const investorStats = db.prepare(`
    SELECT
      COUNT(*) as total_investors,
      COALESCE(SUM(commitment), 0) as total_commitment,
      COALESCE(SUM(called), 0) as total_called,
      COUNT(CASE WHEN status = 'Active' THEN 1 END) as active_investors
    FROM investors
  `).get() as { total_investors: number; total_commitment: number; total_called: number; active_investors: number };

  const overdueTasks = db.prepare(`
    SELECT COUNT(*) as count FROM tasks WHERE done = 0 AND due_date < date('now')
  `).get() as { count: number };

  const dueTodayTasks = db.prepare(`
    SELECT COUNT(*) as count FROM tasks WHERE done = 0 AND due_date = date('now')
  `).get() as { count: number };

  const dueThreeDays = db.prepare(`
    SELECT COUNT(*) as count FROM tasks WHERE done = 0 AND due_date BETWEEN date('now') AND date('now', '+3 days')
  `).get() as { count: number };

  const closedDeals = db.prepare(`
    SELECT COUNT(*) as count, COALESCE(SUM(asking_price), 0) as total FROM deals WHERE stage = 'Closed'
  `).get() as { count: number; total: number };

  const underContract = db.prepare(`
    SELECT COUNT(*) as count FROM deals WHERE stage = 'Under Contract'
  `).get() as { count: number };

  return NextResponse.json({
    dealsByStage,
    totalPipeline: totalPipeline.total,
    activeDeals: activeDeals.count,
    investorStats,
    overdueTasks: overdueTasks.count,
    dueTodayTasks: dueTodayTasks.count,
    dueThreeDays: dueThreeDays.count,
    closedDeals,
    underContract: underContract.count,
  });
}
