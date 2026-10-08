import {
  Body,
  Controller,
  Headers,
  Inject,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { Public } from '../../common/public.decorator';
import { MaxBotService } from './max-bot.service';

@Controller('max')
export class MaxBotController {
  constructor(@Inject(MaxBotService) private readonly bot: MaxBotService) {}

  @Public()
  @Post('webhook')
  async webhook(
    @Headers('x-max-bot-api-secret') secret: string | undefined,
    @Body() update: unknown,
  ) {
    if (!this.bot.verifyWebhookSecret(secret)) {
      throw new UnauthorizedException();
    }
    await this.bot.handleWebhook(update);
    return { ok: true };
  }
}
