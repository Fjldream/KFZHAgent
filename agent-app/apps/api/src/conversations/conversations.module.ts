import { Module } from "@nestjs/common";
import { ConversationController } from "./conversation.controller.js";
import { ConversationService } from "./conversation.service.js";
import { PG_POOL, createPgPool } from "./checkpointer.js";
import { DEFAULT_MODEL_PORT, MODEL_PORT } from "./model-port.js";

@Module({
  controllers: [ConversationController],
  providers: [
    ConversationService,
    { provide: MODEL_PORT, useValue: DEFAULT_MODEL_PORT },
    { provide: PG_POOL, useFactory: createPgPool },
  ],
  exports: [ConversationService],
})
export class ConversationsModule {}
