import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button.jsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.jsx";
import { Textarea } from "@/components/ui/textarea.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.jsx";
import { ScrollArea } from "@/components/ui/scroll-area.jsx";
import { Separator } from "@/components/ui/separator.jsx";
import { Progress } from "@/components/ui/progress.jsx";
import { Alert, AlertDescription } from "@/components/ui/alert.jsx";
import {
  Bot,
  Play,
  Code,
  Terminal,
  BarChart3,
  Image,
  Zap,
  CheckCircle,
  XCircle,
  Clock,
  Globe,
  Shield,
  Atom,
  ArrowUpRight,
  ArrowRight,
  CircleHelp,
  Sparkles,
  X,
} from "lucide-react";
import "./App.css";
import EnterpriseDashboard from "./components/EnterpriseDashboard.jsx";
import { useAtomRunStream } from "./hooks/useAtomRunStream";

function App() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [activePage, setActivePage] = useState(() =>
    window.location.hash === "#dashboard" || window.location.hash === "#atom-overview"
      ? "dashboard"
      : "workspace",
  );
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentTest, setCurrentTest] = useState(null);
  const [executionLogs, setExecutionLogs] = useState([]);
  const [testResults, setTestResults] = useState(null);
  const [executionError, setExecutionError] = useState(null);
  const [focusedRunId, setFocusedRunId] = useState(null);
  const [liveTransitions, setLiveTransitions] = useState([]);
  const [activeTab, setActiveTab] = useState("code");
  const [dashboardRefresh, setDashboardRefresh] = useState(0);
  const [executionEvent, setExecutionEvent] = useState(null);
  const [testType, setTestType] = useState("ui");
  const [mobilePlatform, setMobilePlatform] = useState("android");
  const [mobileDeviceName, setMobileDeviceName] = useState("");
  useEffect(() => {
    const syncPageWithHash = () => {
      setActivePage(
        window.location.hash === "#dashboard" || window.location.hash === "#atom-overview"
          ? "dashboard"
          : "workspace",
      );
    };

    window.addEventListener("hashchange", syncPageWithHash);
    return () => window.removeEventListener("hashchange", syncPageWithHash);
  }, []);
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
  const wsUrl = import.meta.env.VITE_WS_URL || apiBaseUrl.replace(/^http/, "ws");
  const requestHeaders = useMemo(
    () => ({
      "Content-Type": "application/json",
      ...(import.meta.env.VITE_AUTH_TOKEN
        ? { Authorization: `Bearer ${import.meta.env.VITE_AUTH_TOKEN}` }
        : {}),
      ...(import.meta.env.VITE_DEV_USER ? { "X-Dev-User": import.meta.env.VITE_DEV_USER } : {}),
      ...(import.meta.env.VITE_DEV_TENANT_ID
        ? { "X-Tenant-Id": import.meta.env.VITE_DEV_TENANT_ID }
        : {}),
    }),
    [],
  );
  const loadRun = useCallback(
    async (runId) => {
      const response = await fetch(`${apiBaseUrl}/api/runs/${encodeURIComponent(runId)}`, {
        headers: requestHeaders,
        credentials: "include",
      });
      if (!response.ok) throw new Error("run_refresh_failed");
      const run = await response.json();
      if (["passed", "failed", "cancelled"].includes(run.state))
        setTestResults(run.result || { status: run.state });
      return run;
    },
    [apiBaseUrl, requestHeaders],
  );
  useEffect(() => {
    if (!isExecuting || !focusedRunId) return undefined;

    let active = true;
    let timer;
    let lastState = "queued";
    const pollRun = async () => {
      try {
        const run = await loadRun(focusedRunId);
        if (!active) return;
        setExecutionError(null);
        if (run.state !== lastState) {
          lastState = run.state;
          setExecutionEvent({ type: `run.${run.state}`, payload: run });
        }
        if (["passed", "failed", "cancelled"].includes(run.state)) {
          setIsExecuting(false);
          setActiveTab("results");
          setDashboardRefresh((value) => value + 1);
          return;
        }
      } catch (error) {
        if (!active) return;
        console.error("Error refreshing run status:", error);
        setExecutionError("Unable to refresh run status. Retrying automatically.");
      }
      if (active) timer = window.setTimeout(pollRun, 2000);
    };

    timer = window.setTimeout(pollRun, 1000);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [focusedRunId, isExecuting, loadRun]);
  const replayRunEvents = useCallback(
    async (runId, after) => {
      const response = await fetch(
        `${apiBaseUrl}/api/runs/${encodeURIComponent(runId)}/events?after=${after}`,
        { headers: requestHeaders, credentials: "include" },
      );
      if (!response.ok) throw new Error("run_event_replay_failed");
      const body = await response.json();
      return body.events || body;
    },
    [apiBaseUrl, requestHeaders],
  );
  const handleRunTransition = useCallback((event) => {
    const dashboardEvent = { type: event.type, payload: event };
    setExecutionEvent(dashboardEvent);
    setLiveTransitions((current) =>
      [
        event,
        ...current.filter(
          (item) => !(item.runId === event.runId && item.sequence === event.sequence),
        ),
      ].slice(0, 6),
    );
    if (event.state === "running") {
      setIsExecuting(true);
      setExecutionLogs([]);
      setTestResults(null);
    }
    if (["passed", "failed", "cancelled"].includes(event.state)) {
      setIsExecuting(false);
      setActiveTab("results");
    }
  }, []);
  const stream = useAtomRunStream({
    enabled: import.meta.env.VITE_ENABLE_WEBSOCKETS === "true",
    wsUrl,
    tenantId:
      import.meta.env.VITE_DEV_TENANT_ID ||
      import.meta.env.VITE_TENANT_ID ||
      "authenticated-tenant",
    authMode: import.meta.env.VITE_WEBSOCKET_AUTH_MODE || "ticket",
    ticketUrl: `${apiBaseUrl}/api/realtime/websocket-ticket`,
    ticketHeaders: requestHeaders,
    focusedRunIds: focusedRunId ? [focusedRunId] : [],
    onDashboardInvalidated: () => setDashboardRefresh((value) => value + 1),
    onRunTransition: handleRunTransition,
    replayRunEvents,
    loadRun,
    onError: (error) =>
      console.warn("Atom live stream unavailable; HTTP refresh remains active.", error.message),
  });

  const generateTest = async () => {
    if (!prompt.trim()) return;

    try {
      setIsGenerating(true);
      const response = await fetch(`${apiBaseUrl}/api/generate/test`, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify({
          prompt: prompt.trim(),
          testType,
          options:
            testType === "mobile"
              ? {
                  mobile: {
                    platform: mobilePlatform,
                    ...(mobileDeviceName.trim() ? { deviceName: mobileDeviceName.trim() } : {}),
                  },
                }
              : {},
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate test");
      }

      const generatedTest = await response.json();
      setCurrentTest(generatedTest);
      setIsGenerating(false);
    } catch (error) {
      console.error("Error generating test:", error);
      setIsGenerating(false);
    }
  };

  const executeTest = async () => {
    if (!currentTest) return;

    try {
      const sessionId = `session-${Date.now()}`;

      setExecutionError(null);
      const response = await fetch(`${apiBaseUrl}/api/execute/test`, {
        method: "POST",
        headers: { ...requestHeaders, "Idempotency-Key": `ui-${crypto.randomUUID()}` },
        body: JSON.stringify({
          testData: currentTest,
          sessionId,
        }),
      });

      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        throw new Error(failure.error || "Failed to execute test");
      }
      const submission = await response.json();
      const runId = submission.run?.id || null;
      setFocusedRunId(runId);
      setExecutionEvent({
        type: "execution-submitted",
        payload: { ...submission.run, runId, state: submission.status },
      });
      setDashboardRefresh((value) => value + 1);
      setIsExecuting(true);

      // Lifecycle events continue through the tenant-authorized run stream when WebSockets are enabled.
    } catch (error) {
      console.error("Error executing test:", error);
      setIsExecuting(false);
      setExecutionError(error.message || "The test could not be submitted.");
    }
  };

  const examplePrompts = [
    "Test the login page with invalid credentials and verify error message",
    "Check if the signup API returns 404 for missing required fields",
    "Test file upload functionality on Safari browser",
    "Verify responsive design on mobile viewport for homepage",
    "Test payment form validation with various input scenarios",
  ];

  return (
    <main className="enterprise-shell dashboard-background h-screen overflow-y-auto overscroll-contain">
      <a
        className="skip-link"
        href={activePage === "workspace" ? "#ai-test-assistant" : "#dashboard"}
      >
        Skip to {activePage === "workspace" ? "test workspace" : "dashboard content"}
      </a>
      <header className="atom-topbar">
        <a className="atom-brand" href="#test-workspace" aria-label="ATOM Enterprise home">
          <span className="brand-mark">
            <Atom size={25} strokeWidth={1.6} />
          </span>
          <span className="brand-copy">
            <span className="brand-name">ATOM</span>
            <span className="brand-description">Automated Testing &amp; Orchestration Mesh</span>
          </span>
        </a>
        <div className="topbar-breadcrumb">
          <nav className="primary-nav" aria-label="Primary navigation">
            <a
              href="#test-workspace"
              aria-current={activePage === "workspace" ? "page" : undefined}
            >
              <Bot size={16} aria-hidden="true" />
              <span>Test Workspace</span>
            </a>
            <a
              href="#dashboard"
              aria-current={activePage === "dashboard" ? "page" : undefined}
            >
              <BarChart3 size={16} aria-hidden="true" />
              <span>Dashboard</span>
            </a>
            <button
              type="button"
              className="workspace-guide-nav"
              onClick={() => setHelpOpen(true)}
            >
              <CircleHelp size={16} aria-hidden="true" />
              <span>Workspace guide</span>
            </button>
          </nav>
        </div>
        <div className="topbar-right">
          <a
            className="view-source-link"
            href="https://github.com/Samarasimhalu/Atom"
            target="_blank"
            rel="noreferrer"
          >
            <span>View source</span>
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </div>
      </header>
      <div className="enterprise-container w-full px-3 py-4 sm:px-5 sm:py-6">
        {activePage === "workspace" ? (
          <>
        <section className="studio-heading workspace-page-heading" id="test-workspace">
          <div>
            <h1>Test Workspace</h1>
            <p>Create, review, and execute AI-assisted tests.</p>
          </div>
        </section>
        <div className="workspace-section-heading">
          <div>
            <h2>Create a test</h2>
          </div>
          <span className="workspace-mode">
            <span />
            {isExecuting ? "Test running" : currentTest ? "Test generated" : "Ready to create"}
          </span>
        </div>
        <div
          id="ai-test-assistant"
          className="enterprise-workspace scroll-mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3"
        >
          {/* Left Panel - Chat Interface */}
          <div className="assistant-column lg:col-span-1">
            <Card className="enterprise-panel assistant-panel h-fit border border-sky-200 bg-sky-50/85 shadow-sm dark:border-sky-900/70 dark:bg-slate-800">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center space-x-2">
                  <span className="panel-icon assistant-icon">
                    <Bot className="w-5 h-5 text-blue-600" />
                  </span>
                  <span>AI Test Assistant</span>
                  <span className="ai-label">AI</span>
                </CardTitle>
                <CardDescription>
                  Describe the test you want to create and I'll generate it for you.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                {executionError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-700 dark:border-rose-900/50 dark:bg-rose-900/20 dark:text-rose-200"
                  >
                    {executionError}
                  </div>
                )}
                {/* Example Prompts */}
                <div className="example-section space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Quick Examples:</p>
                  <div className="space-y-2">
                    {examplePrompts.slice(0, 3).map((example, index) => (
                      <Button
                        key={index}
                        variant="ghost"
                        size="sm"
                        className="quick-example h-auto p-3 text-left justify-start whitespace-normal text-xs hover:bg-blue-50 dark:hover:bg-slate-700"
                        onClick={() => setPrompt(example)}
                      >
                        <span className="example-icon">
                          {index === 0 ? (
                            <Shield size={15} />
                          ) : index === 1 ? (
                            <Code size={15} />
                          ) : (
                            <Globe size={15} />
                          )}
                        </span>
                        <span>"{example}"</span>
                        <ArrowUpRight className="example-arrow" size={13} />
                      </Button>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Input Area */}
                <div className="prompt-section space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label
                      htmlFor="test-type"
                      className="space-y-1.5 text-xs font-medium text-slate-700 dark:text-slate-200"
                    >
                      <span>Test type</span>
                      <select
                        id="test-type"
                        aria-label="Test type"
                        value={testType}
                        onChange={(event) => setTestType(event.target.value)}
                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900"
                      >
                        <option value="ui">UI / browser</option>
                        <option value="api">API</option>
                        <option value="visual">Visual</option>
                        <option value="mixed">Mixed</option>
                        <option value="mobile">Native mobile</option>
                      </select>
                    </label>
                    {testType === "mobile" && (
                      <label className="space-y-1.5 text-xs font-medium text-slate-700 dark:text-slate-200">
                        <span>Native platform</span>
                        <select
                          aria-label="Native platform"
                          value={mobilePlatform}
                          onChange={(event) => setMobilePlatform(event.target.value)}
                          className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900"
                        >
                          <option value="android">Android · UiAutomator2</option>
                          <option value="ios">iOS · XCUITest</option>
                        </select>
                      </label>
                    )}
                  </div>
                  {testType === "mobile" && (
                    <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/70 p-3 text-xs leading-5 text-violet-900 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-violet-100">
                      <label className="block space-y-1.5 font-medium">
                        <span>
                          Managed device name{" "}
                          <span className="font-normal text-violet-700 dark:text-violet-200">
                            (optional)
                          </span>
                        </span>
                        <input
                          value={mobileDeviceName}
                          maxLength={120}
                          onChange={(event) => setMobileDeviceName(event.target.value)}
                          placeholder={
                            mobilePlatform === "ios" ? "e.g., iPhone 16" : "e.g., Pixel 8"
                          }
                          className="h-9 w-full rounded-md border border-violet-200 bg-white px-3 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 dark:border-violet-800 dark:bg-slate-900 dark:text-slate-100"
                        />
                      </label>
                      <p>
                        Native runs use ATOM’s managed, immutable Appium worker and are admitted
                        only when the platform device broker is configured.
                      </p>
                    </div>
                  )}
                  <label className="prompt-label" htmlFor="test-prompt">
                    Your test scenario <span>Be as specific as you like</span>
                  </label>
                  <Textarea
                    id="test-prompt"
                    placeholder={
                      testType === "mobile"
                        ? `Describe the ${mobilePlatform === "ios" ? "iOS" : "Android"} workflow to automate...`
                        : "Describe the test you want to create..."
                    }
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="prompt-input min-h-[120px] resize-none border-2 focus:border-blue-500 transition-colors"
                  />

                  <div className="flex space-x-2">
                    <Button
                      onClick={generateTest}
                      disabled={!prompt.trim() || isGenerating}
                      className="primary-action flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                    >
                      {isGenerating ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-2" />
                          Generate Test
                          <ArrowRight className="generate-arrow" size={16} />
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="prompt-note">
                    <Shield size={12} />
                    Your test logic stays in your workspace.
                  </p>
                </div>

                {/* Current Test Info */}
                {currentTest && (
                  <div className="generated-test space-y-3 p-4 bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 rounded-lg border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <span className="font-medium text-sm">Test Generated</span>
                      </div>
                      <Badge variant="secondary">{currentTest.testType}</Badge>
                    </div>

                    <p className="text-sm text-muted-foreground">
                      {currentTest.summary?.substring(0, 150)}...
                    </p>

                    <div className="flex flex-wrap gap-1">
                      {currentTest.mcpConfig?.tags?.slice(0, 3).map((tag, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>

                    <Button
                      onClick={executeTest}
                      disabled={isExecuting}
                      className="execute-action w-full bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700"
                    >
                      {isExecuting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                          Executing...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          Execute Test
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Panel - Test Execution */}
          <div id="atom-test-execution" className="scroll-mt-6 lg:col-span-2">
            <Card className="enterprise-panel execution-panel border border-violet-200 bg-violet-50/85 shadow-xl backdrop-blur-sm dark:border-violet-900/70 dark:bg-slate-800/90">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center space-x-2">
                    <span className="panel-icon execution-icon">
                      <Terminal className="w-5 h-5 text-green-600" />
                    </span>
                    <span>Test Execution</span>
                  </CardTitle>

                  {isExecuting && (
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      <span className="text-sm text-muted-foreground">Running...</span>
                    </div>
                  )}
                  {!isExecuting && (
                    <span className="execution-idle">
                      <span />
                      {currentTest ? "Ready to execute" : "Awaiting test"}
                    </span>
                  )}
                </div>
              </CardHeader>

              <CardContent>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsList className="enterprise-tabs grid w-full grid-cols-4 mb-6">
                    <TabsTrigger value="code" className="flex items-center space-x-2">
                      <Code className="w-4 h-4" />
                      <span>Code</span>
                    </TabsTrigger>
                    <TabsTrigger value="logs" className="flex items-center space-x-2">
                      <Terminal className="w-4 h-4" />
                      <span>Logs</span>
                    </TabsTrigger>
                    <TabsTrigger value="results" className="flex items-center space-x-2">
                      <BarChart3 className="w-4 h-4" />
                      <span>Results</span>
                    </TabsTrigger>
                    <TabsTrigger value="media" className="flex items-center space-x-2">
                      <Image className="w-4 h-4" />
                      <span>Media</span>
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="code" className="space-y-4">
                    {currentTest ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold">Generated Test Code</h3>
                          <Badge variant="outline">{currentTest.testType} test</Badge>
                        </div>

                        <ScrollArea className="code-surface h-[500px] w-full rounded-md border bg-slate-50 dark:bg-slate-900">
                          <pre className="p-4 text-sm">
                            <code>{currentTest.code}</code>
                          </pre>
                        </ScrollArea>
                      </div>
                    ) : (
                      <div className="code-empty-state flex flex-col items-center justify-center h-[500px] text-center space-y-4">
                        <div className="empty-state-art" aria-hidden="true">
                          <div className="art-orbit orbit-one" />
                          <div className="art-orbit orbit-two" />
                          <span className="art-spark art-spark-one">
                            <Sparkles size={17} />
                          </span>
                          <span className="art-spark art-spark-two">
                            <Zap size={13} />
                          </span>
                          <span className="art-code">
                            <Code size={34} strokeWidth={1.4} />
                          </span>
                          <span className="art-dot" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg mb-2">No test generated yet</h3>
                          <p className="text-muted-foreground">
                            Enter a prompt and click "Generate Test" to see the code here.
                          </p>
                        </div>
                        <div className="empty-state-hint">
                          <span>1</span>Describe your scenario
                          <ArrowRight size={12} />
                          <span>2</span>Generate your test
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="logs" className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">Execution Logs</h3>
                      {executionLogs.length > 0 && (
                        <Badge variant="outline">{executionLogs.length} entries</Badge>
                      )}
                    </div>

                    <ScrollArea className="code-surface h-[500px] w-full rounded-md border bg-slate-50 dark:bg-slate-900">
                      {executionLogs.length > 0 ? (
                        <div className="p-4 space-y-2">
                          {executionLogs.map((log, index) => (
                            <div key={index} className="text-sm font-mono">
                              <span className="text-muted-foreground text-xs">
                                {new Date(log.timestamp).toLocaleTimeString()}
                              </span>
                              <pre className="whitespace-pre-wrap">{log.content}</pre>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                          <Terminal className="w-16 h-16 text-muted-foreground/50" />
                          <div>
                            <h3 className="font-semibold text-lg mb-2">No execution logs yet</h3>
                            <p className="text-muted-foreground">
                              Execute a test to see real-time logs here.
                            </p>
                          </div>
                        </div>
                      )}
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="results" className="space-y-4">
                    {testResults ? (
                      <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <Card className="p-4">
                            <div className="flex items-center space-x-2">
                              {testResults.status === "passed" ? (
                                <CheckCircle className="w-5 h-5 text-green-600" />
                              ) : (
                                <XCircle className="w-5 h-5 text-red-600" />
                              )}
                              <div>
                                <p className="font-semibold capitalize">{testResults.status}</p>
                                <p className="text-sm text-muted-foreground">Status</p>
                              </div>
                            </div>
                          </Card>

                          <Card className="p-4">
                            <div className="flex items-center space-x-2">
                              <Clock className="w-5 h-5 text-blue-600" />
                              <div>
                                <p className="font-semibold">
                                  {Math.round(testResults.duration / 1000)}s
                                </p>
                                <p className="text-sm text-muted-foreground">Duration</p>
                              </div>
                            </div>
                          </Card>

                          <Card className="p-4">
                            <div className="flex items-center space-x-2">
                              <BarChart3 className="w-5 h-5 text-purple-600" />
                              <div>
                                <p className="font-semibold">
                                  {testResults.summary?.testCount || 1}
                                </p>
                                <p className="text-sm text-muted-foreground">Tests Run</p>
                              </div>
                            </div>
                          </Card>
                        </div>

                        {testResults.summary && (
                          <div className="space-y-4">
                            <h4 className="font-semibold">Test Summary</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                                <div className="font-semibold text-green-600">
                                  {testResults.summary.passedCount}
                                </div>
                                <div className="text-muted-foreground">Passed</div>
                              </div>
                              <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                                <div className="font-semibold text-red-600">
                                  {testResults.summary.failedCount}
                                </div>
                                <div className="text-muted-foreground">Failed</div>
                              </div>
                              <div className="text-center p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                                <div className="font-semibold text-yellow-600">
                                  {testResults.summary.skippedCount}
                                </div>
                                <div className="text-muted-foreground">Skipped</div>
                              </div>
                              <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                <div className="font-semibold text-blue-600">
                                  {testResults.summary.testCount}
                                </div>
                                <div className="text-muted-foreground">Total</div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-[500px] text-center space-y-4">
                        <BarChart3 className="w-16 h-16 text-muted-foreground/50" />
                        <div>
                          <h3 className="font-semibold text-lg mb-2">No test results yet</h3>
                          <p className="text-muted-foreground">
                            Execute a test to see detailed results and analytics here.
                          </p>
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="media" className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">Screenshots & Videos</h3>
                    </div>

                    <div className="flex flex-col items-center justify-center h-[500px] text-center space-y-4">
                      <Image className="w-16 h-16 text-muted-foreground/50" />
                      <div>
                        <h3 className="font-semibold text-lg mb-2">No media artifacts yet</h3>
                        <p className="text-muted-foreground">
                          Screenshots and videos from test execution will appear here.
                        </p>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
                <div className="execution-statusbar">
                  <span>
                    <span className="statusbar-dot" />
                    {isExecuting ? "Execution in progress" : "Test execution workspace"}
                  </span>
                  <span>
                    <Code size={12} />
                    {currentTest ? currentTest.testType : "No test selected"}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
          </>
        ) : (
          <div id="dashboard" className="dashboard-page">
            <EnterpriseDashboard
              refreshSignal={dashboardRefresh}
              executionEvent={executionEvent}
              focusedRunId={focusedRunId}
              streamStatus={stream.status}
              liveTransitions={liveTransitions}
              onReconnect={stream.reconnectNow}
              onRunSelected={setFocusedRunId}
            />
          </div>
        )}

        {/* Footer */}
        <footer className="enterprise-footer mt-12 text-center text-sm text-muted-foreground">
          <p>ATOM · AI-assisted test operations</p>
        </footer>
      </div>
      {helpOpen && (
        <div className="guide-overlay" onClick={() => setHelpOpen(false)}>
          <section
            className="guide-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="guide-title"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") setHelpOpen(false);
              if (event.key === "Tab") {
                event.preventDefault();
                event.currentTarget.querySelector("button")?.focus();
              }
            }}
          >
            <button
              autoFocus
              className="icon-button guide-close"
              aria-label="Close guide"
              onClick={() => setHelpOpen(false)}
            >
              <X size={19} />
            </button>
            <span className="panel-icon assistant-icon">
              <Sparkles size={24} />
            </span>
            <div className="eyebrow">YOUR WORKSPACE, SIMPLIFIED</div>
            <h2 id="guide-title">From idea to execution.</h2>
            <ol>
              <li>
                <span>1</span>
                <div>
                  <strong>Describe your scenario</strong>
                  <p>
                    Choose a test type and enter your requirements, or start with a quick example.
                  </p>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <strong>Generate and review</strong>
                  <p>Select Generate Test, then review the generated code in the Code tab.</p>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <strong>Execute with confidence</strong>
                  <p>
                    Execute your generated test and explore its logs, results, and available media.
                  </p>
                </div>
              </li>
            </ol>
            <p className="guide-footnote">
              Generation and execution require your existing ATOM API. No test data is prepopulated
              or simulated.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}

export default App;
