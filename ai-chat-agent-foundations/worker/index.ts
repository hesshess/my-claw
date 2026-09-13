import { AIChatAgent } from "@cloudflare/ai-chat";
import { routeAgentRequest } from "agents";
import {
  convertToModelMessages,
  isLoopFinished,
  streamText,
  tool,
  type StreamTextOnFinishCallback,
  type ToolSet,
  type UIMessage,
} from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { z } from "zod";

type MenuItem = {
  name: string;
  price: number;
};

type FoodAgentState = {
  cart: MenuItem[];
};

const MENU: MenuItem[] = [
  {
    name: "라지 페퍼로니 피자",
    price: 18000,
  },
  {
    name: "라지 치즈 피자",
    price: 16000,
  },
  {
    name: "콜라",
    price: 2000,
  },
];

export class PotatoChatAgent extends AIChatAgent<Env, FoodAgentState> {
  initialState: FoodAgentState = {
    cart: [],
  };

  private createFoodTools() {
    return {
      getMenu: tool({
        description: "주문 가능한 음식 메뉴와 가격을 조회합니다.",
        inputSchema: z.object({}),

        execute: async () => {
          return {
            menu: MENU,
          };
        },
      }),

      addToCart: tool({
        description: "메뉴에 있는 음식을 장바구니에 추가합니다.",

        inputSchema: z.object({
          item: z.string().describe("장바구니에 담을 정확한 메뉴 이름"),
        }),

        execute: async ({ item }) => {
          const menuItem = MENU.find((menu) => menu.name === item);

          if (!menuItem) {
            return {
              success: false,
              message: "해당 메뉴를 찾을 수 없습니다.",
            };
          }

          const newCart = [...this.state.cart, menuItem];

          this.setState({
            cart: newCart,
          });

          return {
            success: true,
            addedItem: menuItem,
            message: `${menuItem.name}을 장바구니에 담았습니다.`,
          };
        },
      }),
      viewCart: tool({
        description: "장바구니 상품과 전체 금액을 확인합니다.",
        inputSchema: z.object({}),

        execute: async () => {
          const total = this.state.cart.reduce(
            (sum, item) => sum + item.price,
            0,
          );

          return {
            items: this.state.cart,
            total,
          };
        },
      }),
      getLocation: tool({
        description: "브라우저에서 사용자의 현재 위도와 경도를 가져옵니다.",
        inputSchema: z.object({}),
      }),

      placeOrder: tool({
        description:
          "현재 장바구니의 주문을 최종 확정합니다. viewCart로 총액을 확인한 후 호출합니다.",

        inputSchema: z.object({
          total: z.number().describe("장바구니 전체 금액"),
        }),

        needsApproval: true,

        execute: async ({ total }) => {
          const actualTotal = this.state.cart.reduce(
            (sum, item) => sum + item.price,
            0,
          );

          if (this.state.cart.length === 0) {
            return {
              success: false,
              message: "장바구니가 비어 있습니다.",
            };
          }

          // 모델이 전달한 총액과 서버 계산 결과가 다른 경우 주문하지 않습니다.
          if (total !== actualTotal) {
            return {
              success: false,
              message: "장바구니 총액이 일치하지 않습니다.",
              actualTotal,
            };
          }

          const orderedItems = this.state.cart;

          // 주문이 완료되었으므로 장바구니를 비웁니다.
          this.setState({
            cart: [],
          });

          return {
            success: true,
            items: orderedItems,
            total: actualTotal,
            message: "주문이 확정되었습니다! 🍕",
          };
        },
      }),
    };
  }

  async onChatMessage(
    _onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal },
  ) {
    const workersAi = createWorkersAI({
      binding: this.env.AI,
    });
    const result = streamText({
      model: workersAi("@cf/zai-org/glm-4.7-flash"),
      messages: await convertToModelMessages(this.messages),
      tools: this.createFoodTools(),
      abortSignal: options?.abortSignal,
      system: `
      당신은 음식 주문 컨시어지입니다.

      사용자가 음식을 주문하면 반드시 다음 순서로 처리하세요.

      1. getMenu로 실제 메뉴를 확인합니다.
      2. addToCart로 메뉴를 장바구니에 담습니다.
      3. getLocation으로 사용자의 위치를 확인합니다.
      4. viewCart로 장바구니와 총액을 확인합니다.
      5. 총액을 사용자에게 알려준 뒤 placeOrder를 호출합니다.
      6. 사용자가 승인하기 전에는 주문이 완료되었다고 말하지 않습니다.
      7. 메뉴에 없는 음식은 장바구니에 담지 않습니다.
      `,
      stopWhen: isLoopFinished(),
    });
    return result.toUIMessageStreamResponse();
  }

protected sanitizeMessageForPersistence(
  message: UIMessage,
): UIMessage {
  // 공백이나 하이픈을 포함한 13~19자리 숫자를 찾습니다.
  const cardNumberPattern =
    /\b(?:\d[ -]?){12,18}\d\b/g;

  return {
    ...message,

    parts: message.parts.map((part) => {
      if (part.type !== "text") {
        return part;
      }

      return {
        ...part,
        text: part.text.replace(
          cardNumberPattern,
          "[REDACTED]",
        ),
      };
    }),
  };
}
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (
      (await routeAgentRequest(request, env)) ??
      new Response(null, { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
