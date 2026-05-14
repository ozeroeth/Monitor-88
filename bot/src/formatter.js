/**
 * Message Formatter
 * Converts raw API events into clean Telegram HTML messages
 */

const TYPE_EMOJI = {
  twitter: '🐦',
  square: '🟡',
  truth: '🇺🇸',
  news: '📰',
  alpha: '🚀',
  nft: '🎨',
};

const EVENT_LABELS = {
  NEW_TWEET: 'New Tweet',
  NEW_TWEET_REPLY: 'Reply',
  NEW_TWEET_QUOTE: 'Quote',
  NEW_TWEET_RETWEET: 'Retweet',
  TWEET_DELETED: 'Deleted',
  NEW_SQUARE_POST: 'Square Post',
  NEW_SQUARE_QUOTE: 'Square Quote',
  NEW_TRUTH_POST: 'Truth Post',
  NEW_TRUTH_REPOST: 'Truth Repost',
};

function esc(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function truncate(text, max = 500) {
  if (!text) return '';
  if (text.length <= max) return text;
  return text.slice(0, max) + '…';
}

function tweetUrl(handle, tweetId) {
  if (!handle || !tweetId) return '';
  return `https://x.com/${handle}/status/${tweetId}`;
}

function formatMoney(n) {
  const num = Number(n || 0);
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
  return `$${num.toFixed(2)}`;
}

export function formatEvent(type, event) {
  const emoji = TYPE_EMOJI[type] || '📢';
  const eventLabel = EVENT_LABELS[event.eventType] || event.eventType || 'Event';
  const content = event.content || {};
  const handle = content.userScreenName || event.twAccount || '';
  const name = content.userName || '';
  const text = content.text || content.fullText || '';
  const tweetId = content.id || '';

  let header = `${emoji} <b>${esc(eventLabel)}</b>`;
  if (name) header += ` — ${esc(name)}`;
  if (handle) header += ` <code>@${esc(handle)}</code>`;

  let body = esc(truncate(text, 600));

  // Add link
  let link = '';
  if (type === 'twitter' && handle && tweetId) {
    link = `\n🔗 <a href="${tweetUrl(handle, tweetId)}">View on X</a>`;
  } else if (type === 'truth' && content.originalId) {
    link = `\n🔗 <a href="https://truthsocial.com/@${handle}/posts/${content.originalId}">View on Truth</a>`;
  }

  // Followers info
  let meta = '';
  if (content.userFollowers) {
    meta = `\n👥 ${Number(content.userFollowers).toLocaleString()} followers`;
  }

  return `${header}\n\n${body}${link}${meta}`;
}

export function formatNftMint(entry) {
  const name = entry.name || 'Unknown NFT';
  const contract = entry.contract || '';
  const short = contract ? `${contract.slice(0, 6)}…${contract.slice(-4)}` : '?';
  const minted = entry.minted || '0';
  const standard = entry.standard || 'NFT';
  const valueEth = entry.valueWei ? (Number(BigInt(entry.valueWei)) / 1e18).toFixed(4) : '0';
  const txCount = entry.txCount || 0;

  let supply = '';
  if (entry.totalSupply != null) {
    supply = `\n📊 Supply: ${entry.totalSupply}`;
    if (entry.maxSupply != null) supply += ` / ${entry.maxSupply}`;
  }

  let links = '';
  if (contract) links += `\n🔍 <a href="https://etherscan.io/address/${contract}">Etherscan</a>`;
  if (entry.twitter) links += ` | <a href="${esc(entry.twitter)}">Twitter</a>`;

  return `🎨 <b>NFT Mint Detected</b>\n\n` +
    `<b>${esc(name)}</b> <code>${esc(short)}</code>\n` +
    `⛏ Minted: <b>${minted}</b> (${standard})\n` +
    `💰 Value: ${valueEth} ETH | Txs: ${txCount}` +
    `${supply}${links}`;
}

export function formatFomoRow(row, rank) {
  const handle = row.handle || '?';
  const name = row.name || '';
  const pnl = row.pnl_period_usd || row.total_volume_usd || '0';
  const volume = row.total_volume_usd || '0';
  const solWallet = row.real_solana || '';
  const evmWallet = row.real_evm || '';
  const followers = row.followers || '0';

  const shortSol = solWallet ? `${solWallet.slice(0, 6)}…${solWallet.slice(-4)}` : '-';
  const shortEvm = evmWallet ? `${evmWallet.slice(0, 6)}…${evmWallet.slice(-4)}` : '-';

  let text = `<b>#${rank}</b> `;
  text += `<a href="https://fomo.family/profile/${encodeURIComponent(handle)}">@${esc(handle)}</a>`;
  if (name) text += ` ${esc(name)}`;
  text += `\n`;

  if (row.pnl_period_usd) text += `💰 PnL: <b>${formatMoney(row.pnl_period_usd)}</b> | `;
  text += `Vol: ${formatMoney(volume)}`;
  text += ` | 👥 ${Number(followers).toLocaleString()}`;
  text += `\n`;
  text += `SOL: <code>${shortSol}</code>`;
  if (evmWallet) text += ` | EVM: <code>${shortEvm}</code>`;

  return text;
}

export function formatFomoLeaderboard(data, tab) {
  if (!data || !data.rows.length) return `📊 No data available for <b>${tab}</b> tab.`;

  const header = `📊 <b>FOMO Leaderboard — ${esc(data.label)}</b>\n` +
    `Wallets: ${data.meta.realSolN} SOL / ${data.meta.realEvmN} EVM\n` +
    `Total PnL: ${formatMoney(data.meta.totalPnl)}\n\n`;

  const rows = data.rows.map((row, i) => formatFomoRow(row, i + 1)).join('\n\n');
  return header + rows;
}

export function formatWalletLookup(row) {
  if (!row) return '❌ Handle not found in FOMO data.';

  const handle = row.handle || '?';
  const name = row.name || '';
  const tab = row._foundIn || '?';

  let text = `🔍 <b>Wallet Lookup</b> — @${esc(handle)}`;
  if (name) text += ` ${esc(name)}`;
  text += `\n📋 Found in: <b>${tab}</b> tab\n\n`;

  if (row.real_solana) {
    text += `☀️ <b>Solana:</b> <code>${row.real_solana}</code>\n`;
    if (row.real_solana_usd) text += `   💵 ${formatMoney(row.real_solana_usd)}\n`;
    text += `   🔗 <a href="https://gmgn.ai/sol/address/${row.real_solana}">GMGN</a>\n`;
  }
  if (row.real_evm) {
    text += `🔷 <b>EVM:</b> <code>${row.real_evm}</code>\n`;
    if (row.real_evm_usd) text += `   💵 ${formatMoney(row.real_evm_usd)}\n`;
    text += `   🔗 <a href="https://gmgn.ai/eth/address/${row.real_evm}">GMGN</a>\n`;
  }

  if (row.pnl_period_usd) text += `\n💰 PnL: <b>${formatMoney(row.pnl_period_usd)}</b>`;
  if (row.total_volume_usd) text += `\n📊 Volume: ${formatMoney(row.total_volume_usd)}`;
  if (row.trades) text += ` | Trades: ${row.trades}`;
  if (row.followers) text += `\n👥 Followers: ${Number(row.followers).toLocaleString()}`;

  text += `\n\n🔗 <a href="https://fomo.family/profile/${encodeURIComponent(handle)}">FOMO Profile</a>`;

  return text;
}
