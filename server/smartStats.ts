import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  matchReportPlayers,
  matchReports,
  matchStatReviews,
  playerMatchStats,
  playerStatTotals,
} from "../drizzle/schema";
import { getDb } from "./db";

export type ReportPlayerInput = {
  playerId: number;
  goals: number;
  assists: number;
  rating: number;
  manOfMatch: boolean;
};

export type StatDifference = {
  playerId?: number;
  field: string;
  first: unknown;
  second: unknown;
};

export async function dbOrThrowSmart() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db;
}

export async function compareMatchReports(matchId: number) {
  const db = await dbOrThrowSmart();
  const reports = await db.select().from(matchReports).where(eq(matchReports.matchId, matchId)).orderBy(asc(matchReports.submittedAt)).limit(2);
  if (reports.length < 2) return { status: "pending" as const, differences: [], reports };
  const playerRows = await db.select().from(matchReportPlayers).where(inArray(matchReportPlayers.reportId, reports.map(report => report.id)));
  const byReport = new Map<number, typeof playerRows>();
  for (const row of playerRows) byReport.set(row.reportId, [...(byReport.get(row.reportId) || []), row]);
  const first = reports[0];
  const second = reports[1];
  const differences: StatDifference[] = [];
  if (first.homeScore !== second.homeScore) differences.push({ field: "homeScore", first: first.homeScore, second: second.homeScore });
  if (first.awayScore !== second.awayScore) differences.push({ field: "awayScore", first: first.awayScore, second: second.awayScore });
  const firstPlayers = new Map((byReport.get(first.id) || []).map(row => [row.playerId, row]));
  const secondPlayers = new Map((byReport.get(second.id) || []).map(row => [row.playerId, row]));
  for (const playerId of new Set([...firstPlayers.keys(), ...secondPlayers.keys()])) {
    const a = firstPlayers.get(playerId);
    const b = secondPlayers.get(playerId);
    if (!a || !b) {
      differences.push({ playerId, field: "playerPresence", first: Boolean(a), second: Boolean(b) });
      continue;
    }
    for (const field of ["goals", "assists", "rating", "manOfMatch"] as const) {
      if (String(a[field]) !== String(b[field])) differences.push({ playerId, field, first: a[field], second: b[field] });
    }
  }
  const status = differences.length ? "needs_review" : "matched";
  const reviewResult = await db.insert(matchStatReviews).values({
    matchId,
    firstReportId: first.id,
    secondReportId: second.id,
    status: differences.length ? "pending" : "pending",
    differences: differences.length ? differences as unknown as Record<string, unknown> : null,
  }).onDuplicateKeyUpdate({
    set: { firstReportId: first.id, secondReportId: second.id, differences: differences.length ? differences as unknown as Record<string, unknown> : null, updatedAt: new Date() },
  });
  await db.update(matchReports).set({ status }).where(inArray(matchReports.id, reports.map(report => report.id)));
  return { status, differences, reports, reviewId: Number(reviewResult[0].insertId || 0) };
}

export async function rebuildPlayerTotal(userId: number) {
  const db = await dbOrThrowSmart();
  const aggregate = (await db.select({
    matches: sql<number>`COUNT(*)`,
    goals: sql<number>`COALESCE(SUM(${playerMatchStats.goals}), 0)`,
    assists: sql<number>`COALESCE(SUM(${playerMatchStats.assists}), 0)`,
    wins: sql<number>`COALESCE(SUM(CASE WHEN ${playerMatchStats.won} THEN 1 ELSE 0 END), 0)`,
    manOfMatch: sql<number>`COALESCE(SUM(CASE WHEN ${playerMatchStats.manOfMatch} THEN 1 ELSE 0 END), 0)`,
    averageRating: sql<number>`COALESCE(AVG(${playerMatchStats.rating}), 0)`,
  }).from(playerMatchStats).where(eq(playerMatchStats.playerId, userId)))[0];
  const rankingScore = Number(aggregate.goals || 0) * 4 + Number(aggregate.assists || 0) * 3 + Number(aggregate.wins || 0) * 2 + Number(aggregate.manOfMatch || 0) * 5 + Number(aggregate.averageRating || 0);
  await db.insert(playerStatTotals).values({
    userId,
    matches: Number(aggregate.matches || 0),
    goals: Number(aggregate.goals || 0),
    assists: Number(aggregate.assists || 0),
    wins: Number(aggregate.wins || 0),
    manOfMatch: Number(aggregate.manOfMatch || 0),
    averageRating: String(Number(aggregate.averageRating || 0).toFixed(2)),
    rankingScore: String(rankingScore.toFixed(2)),
    updatedAt: new Date(),
  }).onDuplicateKeyUpdate({
    set: {
      matches: Number(aggregate.matches || 0), goals: Number(aggregate.goals || 0), assists: Number(aggregate.assists || 0),
      wins: Number(aggregate.wins || 0), manOfMatch: Number(aggregate.manOfMatch || 0),
      averageRating: String(Number(aggregate.averageRating || 0).toFixed(2)), rankingScore: String(rankingScore.toFixed(2)), updatedAt: new Date(),
    },
  });
}

export async function approveMatchStats(reviewId: number, adminId: number, players: ReportPlayerInput[], wonByPlayerId: number[] = []) {
  const db = await dbOrThrowSmart();
  const review = (await db.select().from(matchStatReviews).where(eq(matchStatReviews.id, reviewId)).limit(1))[0];
  if (!review) throw new Error("Stat review not found");
  const approvedAt = new Date();
  await db.transaction(async tx => {
    await tx.update(matchStatReviews).set({ status: "approved", resolvedBy: adminId, resolvedAt: approvedAt, updatedAt: approvedAt }).where(eq(matchStatReviews.id, reviewId));
    await tx.update(matchReports).set({ status: "approved" }).where(inArray(matchReports.id, [review.firstReportId!, review.secondReportId!].filter(Boolean)));
    for (const player of players) {
      await tx.insert(playerMatchStats).values({
        matchId: review.matchId, playerId: player.playerId, goals: player.goals, assists: player.assists,
        rating: String(player.rating.toFixed(1)), won: wonByPlayerId.includes(player.playerId), manOfMatch: player.manOfMatch,
        sourceReviewId: reviewId, approvedBy: adminId, approvedAt,
      }).onDuplicateKeyUpdate({
        set: { goals: player.goals, assists: player.assists, rating: String(player.rating.toFixed(1)), won: wonByPlayerId.includes(player.playerId), manOfMatch: player.manOfMatch, sourceReviewId: reviewId, approvedBy: adminId, approvedAt, updatedAt: approvedAt },
      });
    }
  });
  await Promise.all([...new Set(players.map(player => player.playerId))].map(rebuildPlayerTotal));
}

export async function getPlayerStatHistory(userId: number) {
  const db = await dbOrThrowSmart();
  return db.select({
    id: playerMatchStats.id, matchId: playerMatchStats.matchId, goals: playerMatchStats.goals, assists: playerMatchStats.assists,
    rating: playerMatchStats.rating, won: playerMatchStats.won, manOfMatch: playerMatchStats.manOfMatch, approvedAt: playerMatchStats.approvedAt,
  }).from(playerMatchStats).where(eq(playerMatchStats.playerId, userId)).orderBy(desc(playerMatchStats.approvedAt)).limit(50);
}
