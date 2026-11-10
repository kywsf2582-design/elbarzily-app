import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, BarChart3, Check, Crown, FileText, Flag, LoaderCircle, Medal, Star, Trophy, Upload, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeading } from "@/features/app/AppShell";
import { trpc } from "@/lib/trpc";

const api = trpc as any;

type PlayerLine = { playerId: number; goals: number; assists: number; rating: number; manOfMatch: boolean };

export default function SmartStatsPage({ user }: { user: { id: number } | null }) {
  const [, setLocation] = useLocation();
  const profile = api.smartStats.profile.useQuery({ userId: user?.id || 0 }, { enabled: Boolean(user), retry: false });
  const myMatches = api.smartStats.myMatches.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const leaderboard = api.smartStats.leaderboard.useQuery({ limit: 10 }, { retry: false });
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const reports = api.smartStats.reportsForMatch.useQuery({ matchId: selectedMatchId || 0 }, { enabled: Boolean(selectedMatchId), retry: false });
  const submit = api.smartStats.submitReport.useMutation();
  const complete = api.matches.complete.useMutation();
  const [teamKey, setTeamKey] = useState("a");
  const [homeScore, setHomeScore] = useState("0");
  const [awayScore, setAwayScore] = useState("0");
  const [lines, setLines] = useState<Record<number, PlayerLine>>({});
  const [mediaUrl, setMediaUrl] = useState("");

  useEffect(() => {
    const first = (myMatches.data?.items || []).find((item: any) => item.match.status === "completed" || new Date(item.match.startsAt).getTime() <= Date.now());
    if (!selectedMatchId && first) setSelectedMatchId(first.match.id);
  }, [myMatches.data, selectedMatchId]);

  useEffect(() => {
    const next: Record<number, PlayerLine> = {};
    for (const player of reports.data?.participants || []) next[player.id] = lines[player.id] || { playerId: player.id, goals: 0, assists: 0, rating: 0, manOfMatch: false };
    setLines(next);
    const mine = reports.data?.reports?.find((report: any) => report.reporterId === user?.id);
    if (mine) { setHomeScore(String(mine.homeScore)); setAwayScore(String(mine.awayScore)); setTeamKey(mine.teamKey); }
    for (const row of reports.data?.players || []) if (mine?.id === row.reportId) next[row.playerId] = { playerId: row.playerId, goals: row.goals, assists: row.assists, rating: Number(row.rating), manOfMatch: row.manOfMatch };
    setLines(next);
  }, [reports.data, user?.id]);

  const selected = (myMatches.data?.items || []).find((item: any) => item.match.id === selectedMatchId);
  const updateLine = (id: number, patch: Partial<PlayerLine>) => setLines(current => ({ ...current, [id]: { ...current[id], ...patch } }));
  const submitReport = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedMatchId) return;
    try {
      await submit.mutateAsync({ matchId: selectedMatchId, teamKey, homeScore: Number(homeScore), awayScore: Number(awayScore), players: Object.values(lines), media: mediaUrl.trim() ? [{ url: mediaUrl.trim(), mimeType: mediaUrl.endsWith(".mp4") || mediaUrl.endsWith(".webm") ? "video/mp4" : "image/jpeg" }] : [] });
      await reports.refetch(); toast.success("تقريرك اتحفظ، وبنقارنه بتقرير الفريق التاني.");
    } catch (error: any) { toast.error(error?.message || "ماقدرناش نحفظ التقرير، جرّب تاني."); }
  };
  const stats = profile.data?.totals || { matches: 0, goals: 0, assists: 0, wins: 0, manOfMatch: 0, averageRating: 0 };
  const statusText = reports.data?.review?.status === "approved" ? "اتعتمد وبيظهر في ملفك" : reports.data?.review?.status === "pending" ? "مستنيين نطابق التقارير" : reports.data?.review?.status === "appealed" ? "فيه اعتراض عليه" : reports.data?.review?.differences ? "فيه اختلافات والإدارة محتاجة تراجعها" : "التقريرين لسه ماكملوش";

  if (!user) return <section className="panel-card"><h2>سجّل دخولك عشان تشوف إحصائياتك</h2><button className="button-primary" onClick={() => setLocation("/join")}>سجّل دخولك <ArrowLeft size={15} /></button></section>;
  return <div className="smart-stats-page" dir="rtl">
    <PageHeading eyebrow="إحصائيات البرازيلي الذكية" title="كارت اللاعب" description="هنا إحصائياتك اللي اتعتمدت بس، من غير أرقام مضروبة أو متكررة." action={<button className="button-outline compact-button" onClick={() => setLocation("/profile")}>ملفك الكامل <ArrowLeft size={15} /></button>} />
    <section className="player-card panel-card"><div className="player-card-main"><div className="profile-avatar">{profile.data?.player?.avatarUrl ? <img src={profile.data.player.avatarUrl} alt="" /> : (profile.data?.player?.name || "ل").charAt(0)}</div><div><span className="eyebrow">كارت اللاعب · #{profile.data?.rank || "—"}</span><h2>{profile.data?.player?.name || "لاعب من البرازيلي"}</h2><p>{profile.data?.player?.position || "مركزه مش متحدد"} · ترتيبك وسط اللاعبين اللي إحصائياتهم اتعتمدت</p></div><Trophy size={32} /></div><div className="profile-stats"><div><b>{stats.matches}</b><small>ماتش</small></div><div><b>{stats.goals}</b><small>أهداف</small></div><div><b>{stats.assists}</b><small>أسيست</small></div><div><b>{stats.wins}</b><small>انتصارات</small></div><div><b>{stats.manOfMatch}</b><small>أفضل لاعب</small></div></div></section>
    <div className="stats-two-column"><section className="panel-card"><div className="panel-title"><div><span className="eyebrow">تقارير الماتشات</span><h2>تقارير الماتشات</h2></div><FileText size={19} /></div><div className="smart-match-list">{(myMatches.data?.items || []).map((item: any) => <button key={item.match.id} className={`smart-match-row${item.match.id === selectedMatchId ? " active" : ""}`} onClick={() => setSelectedMatchId(item.match.id)}><span><b>{item.match.title}</b><small>{item.pitchName} · {new Date(item.match.startsAt).toLocaleDateString("ar-EG")}</small></span><strong>{item.match.status === "completed" ? "التقرير" : new Date(item.match.startsAt).getTime() <= Date.now() ? "إنهاء الماتش وكتابة التقرير" : "جاية"}</strong></button>)}{!(myMatches.data?.items || []).length && <p className="muted">ماتشاتك هتظهر هنا أول ما تنضم لماتش.</p>}</div></section>
      <section className="panel-card"><div className="panel-title"><div><span className="eyebrow">ترتيب اللاعبين</span><h2>ترتيب اللاعبين</h2></div><Medal size={19} /></div>{(leaderboard.data?.items || []).map((item: any, index: number) => <div className="smart-ranking-row" key={item.player.id}><b>#{index + 1}</b><span>{item.player.name || `لاعب #${item.player.id}`}<small>{item.player.position || "لاعب"}</small></span><strong>{Number(item.totals.rankingScore || 0).toFixed(0)} نقطة</strong></div>)}{!(leaderboard.data?.items || []).length && <p className="muted">الترتيب هيظهر بعد ما أول تقرير يتعتمد.</p>}</section></div>
    {selected && <section className="panel-card report-form-card"><div className="panel-title"><div><span className="eyebrow">تقرير بعد الماتش</span><h2>{selected.match.title}</h2></div><BarChart3 size={19} /></div><p className="muted">هنقارن تقريرك بتقرير كابتن الفريق التاني. لو الاتنين متطابقين هيتعتمدوا، وأي اختلاف هيروح للإدارة.</p><form onSubmit={submitReport}><div className="two-fields"><label className="form-field"><span>نتيجة الفريق الأول</span><input type="number" min="0" max="99" value={homeScore} onChange={e => setHomeScore(e.target.value)} /></label><label className="form-field"><span>نتيجة الفريق التاني</span><input type="number" min="0" max="99" value={awayScore} onChange={e => setAwayScore(e.target.value)} /></label></div><label className="form-field"><span>إنت مع أنهي فريق؟</span><select value={teamKey} onChange={e => setTeamKey(e.target.value)}><option value="a">الفريق A</option><option value="b">الفريق B</option></select></label><div className="report-player-grid">{(reports.data?.participants || []).map((player: any) => <article key={player.id}><b>{player.name || `لاعب #${player.id}`}</b><small>{player.position || "لاعب"}</small><div className="three-fields"><input type="number" min="0" max="99" aria-label="أهداف" value={lines[player.id]?.goals || 0} onChange={e => updateLine(player.id, { goals: Number(e.target.value) })} /><input type="number" min="0" max="99" aria-label="أسيست" value={lines[player.id]?.assists || 0} onChange={e => updateLine(player.id, { assists: Number(e.target.value) })} /><input type="number" min="0" max="10" step="0.1" aria-label="التقييم" value={lines[player.id]?.rating || 0} onChange={e => updateLine(player.id, { rating: Number(e.target.value) })} /></div><label><input type="checkbox" checked={Boolean(lines[player.id]?.manOfMatch)} onChange={e => updateLine(player.id, { manOfMatch: e.target.checked })} /> أفضل لاعب</label></article>)}</div><label className="form-field"><span>صورة أو فيديو من الماتش (رابط Manus Storage)</span><div className="input-with-icon"><Upload size={15} /><input value={mediaUrl} onChange={e => setMediaUrl(e.target.value)} placeholder="/manus-storage/..." /></div></label><div className="report-actions"><button className="button-primary" disabled={submit.isPending}>{submit.isPending ? <LoaderCircle className="spin" /> : <Check size={16} />} احفظ التقرير</button>{selected.match.creatorId === user.id && selected.match.status !== "completed" && new Date(selected.match.startsAt).getTime() <= Date.now() && <button className="button-outline" type="button" onClick={() => void complete.mutateAsync({ matchId: selected.match.id }).then(() => { toast.success("الماتش خلص، يلا سجّل التقرير."); void myMatches.refetch(); }, (error: any) => toast.error(error?.message || "ماقدرناش ننهي الماتش، جرّب تاني."))}>إنهاء الماتش</button>}</div></form><div className="settings-hint"><Flag size={15} /><span>{statusText}</span></div></section>}
    <section className="panel-card"><div className="panel-title"><div><span className="eyebrow">سجل الماتشات</span><h2>سجل الماتشات والإنجازات</h2></div><Star size={19} /></div><div className="smart-achievements">{(profile.data?.achievements || []).map((achievement: string) => <span key={achievement}><Crown size={14} />{achievement}</span>)}{!(profile.data?.achievements || []).length && <span>إنجازاتك هتظهر لما تقارير الماتشات تتعتمد.</span>}</div>{(profile.data?.history || []).map((item: any) => <div className="smart-history-row" key={item.id}><span><b>{item.match?.title || `ماتش #${item.matchId}`}</b><small>{item.match?.pitchName || "ملعب"} · {item.won ? "فوز" : "لعبت"}</small></span><strong>{item.goals} هدف · {item.assists} أسيست · {item.rating}/10</strong></div>)}</section>
  </div>;
}
