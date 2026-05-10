interface TelegramBotConfig {
  botToken: string;
  chatId: string;
}

interface TokenNotificationData {
  tokenName: string;
  tokenSymbol: string;
  mint: string;
  poolAddress: string;
  creatorUsername: string;
  imageUrl: string;
  description: string;
}

interface TokenGraduationData {
  tokenName: string;
  tokenSymbol: string;
  mint: string;
  poolAddress: string;
  dammPoolAddress?: string;
  curveProgress: number;
  daoAddress: string;
  treasuryAddress: string;
  migratedToDammV2: boolean;
  imageUrl?: string;
}

export class TelegramBotService {
  private botToken: string;
  private chatId: string;
  private baseUrl: string;

  constructor(config: TelegramBotConfig) {
    this.botToken = config.botToken;
    this.chatId = config.chatId;
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  async sendTokenNotification(data: TokenNotificationData): Promise<boolean> {
    try {
      const message = this.formatTokenMessage(data);
      
      const response = await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: false,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Telegram API error:', errorData);
        return false;
      }

      const result = await response.json();
      console.log('Telegram message sent successfully:', result);
      return true;
    } catch (error) {
      console.error('Error sending Telegram notification:', error);
      return false;
    }
  }

  async sendTokenGraduationNotification(data: TokenGraduationData): Promise<boolean> {
    try {
      const message = this.formatGraduationMessage(data);
      
      const response = await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: false,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Telegram API error:', errorData);
        return false;
      }

      const result = await response.json();
      console.log('Telegram graduation message sent successfully:', result);
      return true;
    } catch (error) {
      console.error('Error sending Telegram graduation notification:', error);
      return false;
    }
  }

  private formatTokenMessage(data: TokenNotificationData): string {
    const jupiterUrl = `https://jup.ag/tokens/${data.mint}`;
    const solscanUrl = `https://solscan.io/token/${data.mint}`;
    const poolUrl = `https://solscan.io/account/${data.poolAddress}`;
    
    return `🚀 <b>New Token Created!</b>

<b>Token:</b> ${data.tokenName} (${data.tokenSymbol})
<b>Creator:</b> ${data.creatorUsername}
<b>Mint Address:</b> <code>${data.mint}</code>
<b>Pool Address:</b> <code>${data.poolAddress}</code>

<b>Description:</b>
${data.description}

🔗 <b>Links:</b>
• <a href="${jupiterUrl}">Trade on Jupiter</a>
• <a href="${solscanUrl}">View on Solscan</a>
• <a href="${poolUrl}">View Pool</a>

⚡ <b>Get in early!</b>`;
  }

  private formatGraduationMessage(data: TokenGraduationData): string {
    const jupiterUrl = `https://jup.ag/tokens/${data.mint}`;
    const solscanUrl = `https://solscan.io/token/${data.mint}`;
    const poolUrl = `https://solscan.io/account/${data.poolAddress}`;
    const daoUrl = `https://solscan.io/account/${data.daoAddress}`;
    const treasuryUrl = `https://solscan.io/account/${data.treasuryAddress}`;
    
    let dammInfo = '';
    if (data.dammPoolAddress) {
      const dammPoolUrl = `https://solscan.io/account/${data.dammPoolAddress}`;
      dammInfo = `
🏊 <b>DAMM Pool:</b> <code>${data.dammPoolAddress}</code>
• <a href="${dammPoolUrl}">View DAMM Pool</a>`;
    }
    
    const migrationStatus = data.migratedToDammV2 ? '✅ Successfully migrated' : '⏳ Migration in progress';
    
    return `🎓 <b>Token Graduated to DAMM V2!</b>

<b>Token:</b> ${data.tokenName} (${data.tokenSymbol})
<b>Curve Progress:</b> ${data.curveProgress}
<b>Status:</b> ${migrationStatus}

<b>Addresses:</b>
• <b>Mint:</b> <code>${data.mint}</code>
• <b>DBC Pool:</b> <code>${data.poolAddress}</code>
• <b>DAO:</b> <code>${data.daoAddress}</code>
• <b>Treasury:</b> <code>${data.treasuryAddress}</code>${dammInfo}

🔗 <b>Links:</b>
• <a href="${jupiterUrl}">Trade on Jupiter</a>
• <a href="${solscanUrl}">View on Solscan</a>
• <a href="${poolUrl}">View DBC Pool</a>
• <a href="${daoUrl}">View DAO</a>
• <a href="${treasuryUrl}">View Treasury</a>

🎉 <b>Congratulations! This token has graduated from DBC to DAMM V2!</b>`;
  }

  async sendTestMessage(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: '🤖 Telegram bot is working! Token notifications will be sent here.',
          parse_mode: 'HTML',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Telegram test message failed:', errorData);
        return false;
      }

      console.log('Telegram test message sent successfully');
      return true;
    } catch (error) {
      console.error('Error sending Telegram test message:', error);
      return false;
    }
  }
}

export async function sendTokenNotification(
  config: TelegramBotConfig,
  data: TokenNotificationData
): Promise<boolean> {
  const bot = new TelegramBotService(config);
  return await bot.sendTokenNotification(data);
}

export async function sendTokenGraduationNotification(
  config: TelegramBotConfig,
  data: TokenGraduationData
): Promise<boolean> {
  const bot = new TelegramBotService(config);
  return await bot.sendTokenGraduationNotification(data);
}
