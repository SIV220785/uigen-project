import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

const {
  pushMock,
  useRouterMock,
  signInActionMock,
  signUpActionMock,
  getAnonWorkDataMock,
  clearAnonWorkMock,
  getProjectsMock,
  createProjectMock,
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  useRouterMock: vi.fn(),
  signInActionMock: vi.fn(),
  signUpActionMock: vi.fn(),
  getAnonWorkDataMock: vi.fn(),
  clearAnonWorkMock: vi.fn(),
  getProjectsMock: vi.fn(),
  createProjectMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: useRouterMock,
}));

vi.mock("@/actions", () => ({
  signIn: signInActionMock,
  signUp: signUpActionMock,
}));

vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: getAnonWorkDataMock,
  clearAnonWork: clearAnonWorkMock,
}));

vi.mock("@/actions/get-projects", () => ({
  getProjects: getProjectsMock,
}));

vi.mock("@/actions/create-project", () => ({
  createProject: createProjectMock,
}));

import { useAuth } from "@/hooks/use-auth";

type AuthResult = {
  success: boolean;
  error?: string;
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useRouterMock.mockReturnValue({
      push: pushMock,
    });

    getAnonWorkDataMock.mockReturnValue(null);
    getProjectsMock.mockResolvedValue([]);
    createProjectMock.mockResolvedValue({ id: "new-project" });
    signInActionMock.mockResolvedValue({ success: true } satisfies AuthResult);
    signUpActionMock.mockResolvedValue({ success: true } satisfies AuthResult);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test("exposes auth methods with loading disabled by default", () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.signIn).toBeTypeOf("function");
    expect(result.current.signUp).toBeTypeOf("function");
  });

  test("signIn creates a project from anonymous work and redirects on success", async () => {
    getAnonWorkDataMock.mockReturnValue({
      messages: [{ id: "1", role: "user", content: "Build a card" }],
      fileSystemData: { "/App.jsx": { type: "file", content: "export default null" } },
    });
    createProjectMock.mockResolvedValue({ id: "anon-project" });
    vi.spyOn(Date.prototype, "toLocaleTimeString").mockReturnValue("10:15:30 AM");

    const { result } = renderHook(() => useAuth());

    let authResult: AuthResult | undefined;
    await act(async () => {
      authResult = await result.current.signIn("user@example.com", "password123");
    });

    expect(authResult).toEqual({ success: true });
    expect(signInActionMock).toHaveBeenCalledWith("user@example.com", "password123");
    expect(createProjectMock).toHaveBeenCalledWith({
      name: "Design from 10:15:30 AM",
      messages: [{ id: "1", role: "user", content: "Build a card" }],
      data: { "/App.jsx": { type: "file", content: "export default null" } },
    });
    expect(clearAnonWorkMock).toHaveBeenCalledTimes(1);
    expect(getProjectsMock).not.toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith("/anon-project");
    expect(result.current.isLoading).toBe(false);
  });

  test("signIn ignores anonymous work without messages and redirects to the most recent project", async () => {
    getAnonWorkDataMock.mockReturnValue({
      messages: [],
      fileSystemData: { "/App.jsx": { type: "file", content: "stale" } },
    });
    getProjectsMock.mockResolvedValue([{ id: "recent-project" }, { id: "older-project" }]);

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn("user@example.com", "password123");
    });

    expect(getProjectsMock).toHaveBeenCalledTimes(1);
    expect(createProjectMock).not.toHaveBeenCalled();
    expect(clearAnonWorkMock).not.toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith("/recent-project");
  });

  test("signIn creates a new project when the user has no previous projects", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.12345);
    createProjectMock.mockResolvedValue({ id: "fresh-project" });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn("user@example.com", "password123");
    });

    expect(getProjectsMock).toHaveBeenCalledTimes(1);
    expect(createProjectMock).toHaveBeenCalledWith({
      name: "New Design #12345",
      messages: [],
      data: {},
    });
    expect(pushMock).toHaveBeenCalledWith("/fresh-project");
  });

  test("signIn returns an unsuccessful result without post-login side effects", async () => {
    signInActionMock.mockResolvedValue({
      success: false,
      error: "Invalid credentials",
    } satisfies AuthResult);

    const { result } = renderHook(() => useAuth());

    let authResult: AuthResult | undefined;
    await act(async () => {
      authResult = await result.current.signIn("user@example.com", "bad-password");
    });

    expect(authResult).toEqual({
      success: false,
      error: "Invalid credentials",
    });
    expect(getAnonWorkDataMock).not.toHaveBeenCalled();
    expect(getProjectsMock).not.toHaveBeenCalled();
    expect(createProjectMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
  });

  test("signUp redirects to the most recent project after a successful registration", async () => {
    getProjectsMock.mockResolvedValue([{ id: "signup-project" }]);

    const { result } = renderHook(() => useAuth());

    let authResult: AuthResult | undefined;
    await act(async () => {
      authResult = await result.current.signUp("new@example.com", "password123");
    });

    expect(authResult).toEqual({ success: true });
    expect(signUpActionMock).toHaveBeenCalledWith("new@example.com", "password123");
    expect(getProjectsMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith("/signup-project");
  });

  test("signUp returns an unsuccessful result without redirecting", async () => {
    signUpActionMock.mockResolvedValue({
      success: false,
      error: "Email already registered",
    } satisfies AuthResult);

    const { result } = renderHook(() => useAuth());

    let authResult: AuthResult | undefined;
    await act(async () => {
      authResult = await result.current.signUp("new@example.com", "password123");
    });

    expect(authResult).toEqual({
      success: false,
      error: "Email already registered",
    });
    expect(getAnonWorkDataMock).not.toHaveBeenCalled();
    expect(createProjectMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
  });

  test("signIn sets loading while pending and resets it when the action rejects", async () => {
    const deferred = createDeferred<AuthResult>();
    const failure = new Error("Network error");
    signInActionMock.mockReturnValue(deferred.promise);

    const { result } = renderHook(() => useAuth());

    let signInPromise: Promise<AuthResult>;
    act(() => {
      signInPromise = result.current.signIn("user@example.com", "password123");
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      deferred.reject(failure);
      await expect(signInPromise!).rejects.toThrow("Network error");
    });

    expect(result.current.isLoading).toBe(false);
  });

  test("signIn resets loading when post-login project lookup fails", async () => {
    const failure = new Error("Projects unavailable");
    getProjectsMock.mockRejectedValue(failure);

    const { result } = renderHook(() => useAuth());

    await expect(
      act(async () => result.current.signIn("user@example.com", "password123"))
    ).rejects.toThrow("Projects unavailable");

    expect(pushMock).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
  });
});