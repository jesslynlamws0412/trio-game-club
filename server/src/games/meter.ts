/** 网络延迟补偿最多补多少毫秒（再高的延迟说明连接本身有问题，不继续补） */
export const COMP_MAX_MS = 500;

/** 根据服务器测到的往返延迟，算出这次点击要往回“倒”多少毫秒 */
export const compensation = (rttMs?: number) => Math.max(0, Math.min(COMP_MAX_MS, Math.round(rttMs ?? 0)));

/**
 * 力度条（来回摆动的指针），保龄球和篮球共用。
 * 指针的位置只由“服务器上的时间”决定：开始时间 + 经过的时间 → 三角波，0 → 1 → 0 循环。
 *
 * 判定要和玩家当时在屏幕上看到的一致：
 *   玩家看到的指针比服务器上的真实位置晚一个“下行延迟”（画面从服务器传到手机要时间），
 *   他点下去以后，点击再花一个“上行延迟”才到服务器。所以点击到达服务器时，真实指针已经比他看到的多走了一个往返。
 *   服务器自己测每个玩家的往返延迟（RTT），判定时把时间往回倒一个 RTT，这样不管网络快慢，判定的就是玩家点下去那一刻看到的位置。
 * 客户端不能报时间，所以不能靠谎报来作弊（补偿量由服务器测的，而且有上限）。
 */
export class Meter {
  private start = Date.now();
  constructor(public period: number) {}

  arm(period?: number) {
    if (period) this.period = period;
    this.start = Date.now();
  }

  /** 某个时刻的指针位置 0~1，0.5 是正中间（最佳位置） */
  pos(now = Date.now()) {
    const t = Math.max(0, now - this.start);
    const u = (t % this.period) / this.period;
    return u < 0.5 ? u * 2 : 2 - 2 * u;
  }

  /** 玩家点击时的指针位置（已补偿网络延迟），同时返回补偿了多少毫秒 */
  tap(rttMs?: number, now = Date.now()) {
    const comp = compensation(rttMs);
    return { pos: this.pos(now - comp), comp };
  }

  view() {
    return { sinceMs: Date.now() - this.start, period: this.period };
  }
}
