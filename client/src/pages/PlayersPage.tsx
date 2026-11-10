import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, Check, Clock3, LoaderCircle, Search, ShieldCheck, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageHeading } from "@/features/app/AppShell";
import { trpc } from "@/lib/trpc";
import { mediaUrl } from "@/lib/mediaUrl";
import "./players.css";

const api = trpc as any;
type Player = { id: number; name?: string | null; age?: number | null; position?: string | null; skillLevel?: string | null; bio?: string | null; avatarUrl?: string | null; lastSeenAt?: string | Date | null; isOnline?: boolean };
type Item = Record<string, any>;
const positionLabels: Record<string, string> = { goalkeeper: "حارس مرمى", defender: "مدافع", midfielder: "لاعب وسط", forward: "مهاجم" };
function lastSeen(player: Player) {
  if (player.isOnline) return "أونلاين دلوقتي";
  if (!player.lastSeenAt) return "مش معروف كان أونلاين إمتى";
  const date = new Date(player.lastSeenAt);
  return `آخر مرة كان أونلاين ${date.toLocaleDateString("ar-EG", { day: "numeric", month: "short" })} ${date.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}`;
}
function Avatar({ player }: { player: Player }) {
  return <span className="player-avatar">{mediaUrl(player.avatarUrl) ? <img src={mediaUrl(player.avatarUrl)} alt="" loading="lazy" onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = "/brzly-logo.svg"; }} /> : (player.name || "ب").trim().charAt(0)}</span>;
}

export default function PlayersPage() {
  const [, setLocation] = useLocation();
  const [profileMatch, profileParams] = useRoute("/players/:playerId");
  const playerId = profileMatch ? Number(profileParams?.playerId) : null;
  const [searchText, setSearchText] = useState("");
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("");
  const [skillLevel, setSkillLevel] = useState("");
  const utils = trpc.useUtils();
  const meQuery = api.auth.me.useQuery(undefined, { retry: false, staleTime: 0 });
  const playerQuery = api.social.players.search.useQuery({ query: query || undefined, position: position || undefined, skillLevel: skillLevel || undefined, limit: 40 }, { enabled: Boolean(meQuery.data && !playerId), retry: false });
  const profileQuery = api.social.players.profile.useQuery({ playerId: playerId || 0 }, { enabled: Boolean(meQuery.data && playerId), retry: false });
  const statusQuery = api.social.friends.status.useQuery({ playerId: playerId || 0 }, { enabled: Boolean(meQuery.data && playerId), retry: false });
  const requestsQuery = api.social.friends.requests.useQuery(undefined, { enabled: Boolean(meQuery.data && !playerId), retry: false });
  const friendsQuery = api.social.friends.mine.useQuery(undefined, { enabled: Boolean(meQuery.data && !playerId), retry: false });
  const requestFriend = api.social.friends.request.useMutation();
  const acceptFriend = api.social.friends.accept.useMutation();
  const declineFriend = api.social.friends.decline.useMutation();
  const blockUser = api.social.blocks.block.useMutation();
  const unblockUser = api.social.blocks.unblock.useMutation();
  const blockStatusQuery = api.social.blocks.status.useQuery({ userId: playerId || 0 }, { enabled: Boolean(meQuery.data && playerId && playerId !== meQuery.data.id), retry: false });

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(searchText.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchText]);

  const requests = (requestsQuery.data?.items || []) as Item[];
  const friends = (friendsQuery.data?.items || []) as Player[];
  const friendIds = useMemo(() => new Set(friends.map(friend => friend.id)), [friends]);
  const outgoingIds = useMemo(() => new Set(requests.filter(item => item.direction === "outgoing").map(item => item.player?.id)), [requests]);
  const incomingByPlayer = useMemo(() => new Map<number, Item>(requests.filter(item => item.direction === "incoming").map(item => [item.player?.id, item])), [requests]);

  const refreshSocial = async () => {
    await Promise.all([utils.social.friends.requests.invalidate(), utils.social.friends.mine.invalidate(), utils.social.players.search.invalidate(), utils.social.friends.status.invalidate()]);
  };
  const sendRequest = async (targetId: number) => {
    try { await requestFriend.mutateAsync({ playerId: targetId }); await refreshSocial(); toast.success("طلب الصداقة اتبعت."); }
    catch (error: any) { toast.error(error?.message || "ماقدرناش نبعت طلب الصداقة، جرّب تاني."); }
  };
  const acceptRequest = async (requestId: number) => {
    try { await acceptFriend.mutateAsync({ requestId }); await refreshSocial(); toast.success("بقيتوا أصحاب دلوقتي، ماتش حلو سوا!"); }
    catch (error: any) { toast.error(error?.message || "ماقدرناش نقبل الطلب، جرّب تاني."); }
  };
  const declineRequest = async (requestId: number) => {
    try { await declineFriend.mutateAsync({ requestId }); await refreshSocial(); }
    catch (error: any) { toast.error(error?.message || "ماقدرناش نتعامل مع الطلب، جرّب تاني."); }
  };
  const toggleBlock = async () => {
    if (!playerId) return;
    try { if (blockStatusQuery.data?.blocked) await unblockUser.mutateAsync({ userId: playerId }); else await blockUser.mutateAsync({ userId: playerId }); await blockStatusQuery.refetch(); toast.success(blockStatusQuery.data?.blocked ? "شيلنا الحظر." : "حظرنا اللاعب."); }
    catch (error: any) { toast.error(error?.message || "ماقدرناش نحدّث الحظر، جرّب تاني."); }
  };

  const player = profileQuery.data as Player | undefined;
  const state = statusQuery.data?.state;
  const currentUser = meQuery.data;
  if (!currentUser) return <main className="players-page" dir="rtl"><section className="panel-card players-signin"><ShieldCheck size={24} /><h1>دليل اللاعبين</h1><p>سجّل دخولك عشان تدور على لاعبين وتتابع طلبات الصداقة.</p><button className="button-primary" onClick={() => setLocation("/login")}>سجّل دخولك <ArrowLeft size={15} /></button></section></main>;

  return <AppShell user={currentUser}>
    <main className="players-page" dir="rtl">
      {playerId ? <>
        <PageHeading eyebrow="ملف لاعب" title={playerQuery.isLoading ? "بنحمّل الملف" : player?.name || "لاعب من البرازيلي"} description="اتعرّف على لاعب من مجتمع البرازيلي." action={<button className="button-outline compact-button" onClick={() => setLocation("/players")}><ArrowLeft size={15} /> دليل اللاعبين</button>} />
        {profileQuery.isLoading ? <div className="panel-card players-empty"><LoaderCircle className="spin" /> بنحمّل الملف…</div> : player ? <section className="panel-card player-profile-card">
          <div className="player-profile-top"><Avatar player={player} /><div><h2>{player.name || "لاعب"}</h2><span className={`player-presence ${player.isOnline ? "online" : ""}`}><i />{lastSeen(player)}</span></div></div>
          <div className="player-profile-meta">{player.age ? <span>{player.age} سنة</span> : null}{player.position ? <span>{positionLabels[player.position] || player.position}</span> : null}{player.skillLevel ? <span>{player.skillLevel}</span> : null}</div>
          <p className="player-profile-bio">{player.bio || "اللاعب ده لسه ماكتبش نبذة عن نفسه."}</p>
          <div className="player-actions">
            {state === "friends" ? <span className="muted">صديق</span>
              : state === "incoming" ? <button className="button-primary" onClick={() => acceptRequest(statusQuery.data?.requestId)} disabled={acceptFriend.isPending}><Check size={16} /> اقبل طلب الصداقة</button>
              : state === "outgoing" ? <button className="button-outline" disabled><Clock3 size={16} /> مستنيين موافقتك</button>
              : currentUser.id === player.id ? <span className="muted">ده ملفك الشخصي.</span>
              : <button className="button-primary" onClick={() => sendRequest(player.id)} disabled={requestFriend.isPending}><UserPlus size={16} /> ضيف صديق</button>}
            {currentUser.id !== player.id && <button className="button-outline" onClick={() => void toggleBlock()} disabled={blockUser.isPending || unblockUser.isPending}>{blockStatusQuery.data?.blocked ? "شيل الحظر" : "احظر اللاعب"}</button>}
          </div>
        </section> : <section className="panel-card players-empty"><h2>الملف ده مش متاح</h2><p>ممكن اللاعب يكون مخبّي ملفه من دليل اللاعبين.</p><button className="button-outline" onClick={() => setLocation("/players")}>ارجع للدليل</button></section>}
      </> : <>
        <PageHeading eyebrow="مجتمع اللاعبين" title="اكتشف لاعبين جدد" description="دور بالاسم أو مركز اللعب، وابعت طلب صداقة عشان تنسّقوا سوا." />
        <section className="players-search panel-card">
          <label className="players-search-input"><Search size={17} /><input value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="دور باسم اللاعب" aria-label="دور باسم اللاعب" /></label>
          <label className="players-position-filter"><span>مركز اللعب</span><select value={position} onChange={event => setPosition(event.target.value)}><option value="">كل المراكز</option><option value="goalkeeper">حارس مرمى</option><option value="defender">مدافع</option><option value="midfielder">لاعب وسط</option><option value="forward">مهاجم</option></select></label>
          <label className="players-position-filter"><span>المستوى</span><select value={skillLevel} onChange={event => setSkillLevel(event.target.value)}><option value="">كل المستويات</option><option value="مبتدئ">مبتدئ</option><option value="متوسط">متوسط</option><option value="متقدم">متقدم</option><option value="محترف">محترف</option></select></label>
        </section>
        {requests.some(item => item.direction === "incoming") && <section className="panel-card player-requests"><div className="panel-title"><div><span className="eyebrow">طلبات جديدة</span><h2>طلبات الصداقة اللي وصلتك</h2></div><Users size={19} /></div><div className="player-request-list">{requests.filter(item => item.direction === "incoming").map(item => <article className="player-request-row" key={item.id}><button className="player-identity" onClick={() => setLocation(`/players/${item.player.id}`)}><Avatar player={item.player} /><span><b>{item.player.name || "لاعب"}</b><small>{item.player.position ? positionLabels[item.player.position] : "لاعب جديد"}</small></span></button><div><button className="button-primary compact-button" onClick={() => acceptRequest(item.id)} disabled={acceptFriend.isPending}><Check size={14} /> قبول</button><button className="button-ghost compact-button" onClick={() => declineRequest(item.id)} disabled={declineFriend.isPending}><X size={14} /> رفض</button></div></article>)}</div></section>}
        <section className="players-directory-section"><div className="players-section-head"><h2>{query || position || skillLevel ? "نتايج البحث" : "لاعبين ممكن يعجبوك"}</h2><span>{(playerQuery.data?.items || []).length} لاعب</span></div>
          {playerQuery.isLoading ? <div className="panel-card players-empty"><LoaderCircle className="spin" /> بندور…</div>
            : playerQuery.isError ? <div className="panel-card players-empty">ماقدرناش نحمّل دليل اللاعبين. اتأكد من اتصالك وجرّب تاني.</div>
            : (playerQuery.data?.items || []).length ? <div className="players-grid">{(playerQuery.data.items as Player[]).map(item => <article className="panel-card player-card" key={item.id}>
              <button className="player-card-main" onClick={() => setLocation(`/players/${item.id}`)}><Avatar player={item} /><span className={`player-presence ${item.isOnline ? "online" : ""}`}><i />{lastSeen(item)}</span><h3>{item.name || "لاعب"}</h3><p>{[item.age ? `${item.age} سنة` : null, item.position ? positionLabels[item.position] : null, item.skillLevel].filter(Boolean).join(" · ") || "لاعب كورة"}</p><small>{item.bio || "ملف لاعب في مجتمع البرازيلي"}</small></button>
              <div className="player-card-actions">{friendIds.has(item.id) ? <span className="muted">صديق</span>
                : incomingByPlayer.has(item.id) ? <button className="button-primary compact-button" onClick={() => { const request = incomingByPlayer.get(item.id); if (request) void acceptRequest(request.id); }} disabled={acceptFriend.isPending}><Check size={14} /> قبول الطلب</button>
                : outgoingIds.has(item.id) ? <button className="button-ghost compact-button" disabled><Clock3 size={14} /> بانتظار الرد</button>
                : <button className="button-primary compact-button" onClick={() => sendRequest(item.id)} disabled={requestFriend.isPending}><UserPlus size={14} /> ضيف صديق</button>}</div>
            </article>)}</div>
            : <div className="panel-card players-empty"><Users size={22} /><h3>مفيش نتايج لحد دلوقتي</h3><p>جرّب اسم أو مركز تاني، أو خلّي ملفك ظاهر عشان باقي اللاعبين يلاقوك.</p></div>}
        </section>
        {friends.length > 0 && <section className="panel-card player-friends"><div className="panel-title"><div><span className="eyebrow">دايرتك</span><h2>أصدقاؤك</h2></div><Users size={19} /></div><div className="player-friend-list">{friends.slice(0, 12).map(friend => <button className="player-identity" key={friend.id} onClick={() => setLocation(`/players/${friend.id}`)}><Avatar player={friend} /><span><b>{friend.name || "لاعب"}</b><small>{friend.isOnline ? "أونلاين دلوقتي" : friend.position ? positionLabels[friend.position] : "صديق"}</small></span></button>)}</div></section>}
      </>}
    </main>
  </AppShell>;
}
