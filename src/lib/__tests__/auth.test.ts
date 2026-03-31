import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const { cookiesMock, signMock, jwtVerifyMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  signMock: vi.fn(),
  jwtVerifyMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

vi.mock("jose", () => ({
  SignJWT: class {
    private payload: unknown;

    constructor(payload: unknown) {
      this.payload = payload;
    }

    setProtectedHeader() {
      return this;
    }

    setExpirationTime() {
      return this;
    }

    setIssuedAt() {
      return this;
    }

    async sign(secret: Uint8Array) {
      return signMock(this.payload, secret);
    }
  },
  jwtVerify: jwtVerifyMock,
}));

import {
  createSession,
  deleteSession,
  getSession,
  verifySession,
} from "@/lib/auth";

type CookieOptions = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
  expires?: Date;
  path?: string;
};

function createCookieStore(initialToken?: string) {
  let storedToken = initialToken;
  let storedOptions: CookieOptions | undefined;

  return {
    set: vi.fn((name: string, value: string, options: CookieOptions) => {
      if (name === "auth-token") {
        storedToken = value;
        storedOptions = options;
      }
    }),
    get: vi.fn((name: string) => {
      if (name !== "auth-token" || !storedToken) {
        return undefined;
      }

      return { value: storedToken };
    }),
    delete: vi.fn((name: string) => {
      if (name === "auth-token") {
        storedToken = undefined;
      }
    }),
    getStoredToken: () => storedToken,
    getStoredOptions: () => storedOptions,
  };
}

function createRequest(token?: string): NextRequest {
  return {
    cookies: {
      get: vi.fn((name: string) => {
        if (name !== "auth-token" || !token) {
          return undefined;
        }

        return { value: token };
      }),
    },
  } as unknown as NextRequest;
}

describe("auth", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    cookiesMock.mockReset();
    signMock.mockReset();
    jwtVerifyMock.mockReset();
    process.env.NODE_ENV = "test";

    signMock.mockImplementation(async (payload: unknown) =>
      JSON.stringify(payload)
    );

    jwtVerifyMock.mockImplementation(async (token: string) => {
      if (token === "invalid-token") {
        throw new Error("Invalid token");
      }

      return { payload: JSON.parse(token) };
    });
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
  });

  test("createSession stores a signed auth cookie", async () => {
    const cookieStore = createCookieStore();
    cookiesMock.mockResolvedValue(cookieStore);

    await createSession("user-1", "user@example.com");

    expect(cookieStore.set).toHaveBeenCalledTimes(1);
    expect(cookieStore.getStoredToken()).toEqual(expect.any(String));
    expect(cookieStore.getStoredOptions()).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
    });
    expect(cookieStore.getStoredOptions()?.expires).toBeInstanceOf(Date);
  });

  test("createSession sets secure cookies in production", async () => {
    const cookieStore = createCookieStore();
    cookiesMock.mockResolvedValue(cookieStore);
    process.env.NODE_ENV = "production";

    await createSession("user-1", "user@example.com");

    expect(cookieStore.getStoredOptions()?.secure).toBe(true);
  });

  test("getSession returns null when auth cookie is missing", async () => {
    const cookieStore = createCookieStore();
    cookiesMock.mockResolvedValue(cookieStore);

    const session = await getSession();

    expect(session).toBeNull();
  });

  test("getSession returns the decoded session for a valid token", async () => {
    const cookieStore = createCookieStore();
    cookiesMock.mockResolvedValue(cookieStore);

    await createSession("user-1", "user@example.com");

    const session = await getSession();

    expect(session).not.toBeNull();
    expect(session?.userId).toBe("user-1");
    expect(session?.email).toBe("user@example.com");
    expect(session?.expiresAt).toEqual(expect.any(String));
  });

  test("getSession returns null for an invalid token", async () => {
    const cookieStore = createCookieStore("invalid-token");
    cookiesMock.mockResolvedValue(cookieStore);

    const session = await getSession();

    expect(session).toBeNull();
  });

  test("deleteSession removes the auth cookie", async () => {
    const cookieStore = createCookieStore("some-token");
    cookiesMock.mockResolvedValue(cookieStore);

    await deleteSession();

    expect(cookieStore.delete).toHaveBeenCalledWith("auth-token");
    expect(cookieStore.getStoredToken()).toBeUndefined();
  });

  test("verifySession returns null when request cookie is missing", async () => {
    const request = createRequest();

    const session = await verifySession(request);

    expect(session).toBeNull();
  });

  test("verifySession returns the decoded session for a valid request token", async () => {
    const cookieStore = createCookieStore();
    cookiesMock.mockResolvedValue(cookieStore);
    await createSession("user-2", "verify@example.com");

    const request = createRequest(cookieStore.getStoredToken());
    const session = await verifySession(request);

    expect(session).not.toBeNull();
    expect(session?.userId).toBe("user-2");
    expect(session?.email).toBe("verify@example.com");
  });

  test("verifySession returns null for an invalid request token", async () => {
    const request = createRequest("invalid-token");

    const session = await verifySession(request);

    expect(session).toBeNull();
  });
});