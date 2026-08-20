import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.jsx';
import { ScrollArea } from '@/components/ui/scroll-area.jsx';
import { Separator } from '@/components/ui/separator.jsx';
import { Progress } from '@/components/ui/progress.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
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
  Cpu,
  Globe,
  Shield,
  Rocket
} from 'lucide-react';
import './App.css';
import EnterpriseDashboard from './components/EnterpriseDashboard.jsx';
import { useAtomRunStream } from './hooks/useAtomRunStream';
import atomLogo from './assets/atom-logo.png';

function App() {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentTest, setCurrentTest] = useState(null);
  const [executionLogs, setExecutionLogs] = useState([]);
  const [testResults, setTestResults] = useState(null);
  const [executionError, setExecutionError] = useState(null);
  const [focusedRunId, setFocusedRunId] = useState(null);
  const [liveTransitions, setLiveTransitions] = useState([]);
  const [activeTab, setActiveTab] = useState('code');
  const [dashboardRefresh, setDashboardRefresh] = useState(0);
  const [executionEvent, setExecutionEvent] = useState(null);
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
  const wsUrl = import.meta.env.VITE_WS_URL || apiBaseUrl.replace(/^http/, 'ws');
  const requestHeaders = useMemo(() => ({
    'Content-Type': 'application/json',
    ...(import.meta.env.VITE_AUTH_TOKEN ? { Authorization: `Bearer ${import.meta.env.VITE_AUTH_TOKEN}` } : {}),
    ...(import.meta.env.VITE_DEV_USER ? { 'X-Dev-User': import.meta.env.VITE_DEV_USER } : {}),
    ...(import.meta.env.VITE_DEV_TENANT_ID ? { 'X-Tenant-Id': import.meta.env.VITE_DEV_TENANT_ID } : {})
  }), []);
  const loadRun = useCallback(async runId => {
    const response = await fetch(`${apiBaseUrl}/api/runs/${encodeURIComponent(runId)}`, { headers: requestHeaders, credentials: 'include' });
    if (!response.ok) throw new Error('run_refresh_failed');
    const run = await response.json();
    if (['passed', 'failed', 'cancelled'].includes(run.state)) setTestResults(run.result || { status: run.state });
    return run;
  }, [apiBaseUrl, requestHeaders]);
  const replayRunEvents = useCallback(async (runId, after) => {
    const response = await fetch(`${apiBaseUrl}/api/runs/${encodeURIComponent(runId)}/events?after=${after}`, { headers: requestHeaders, credentials: 'include' });
    if (!response.ok) throw new Error('run_event_replay_failed');
    const body = await response.json();
    return body.events || body;
  }, [apiBaseUrl, requestHeaders]);
  const handleRunTransition = useCallback(event => {
    const dashboardEvent = { type: event.type, payload: event };
    setExecutionEvent(dashboardEvent);
    setLiveTransitions(current => [event, ...current.filter(item => !(item.runId === event.runId && item.sequence === event.sequence))].slice(0, 6));
    if (event.state === 'running') { setIsExecuting(true); setExecutionLogs([]); setTestResults(null); }
    if (['passed', 'failed', 'cancelled'].includes(event.state)) { setIsExecuting(false); setActiveTab('results'); }
  }, []);
  const stream = useAtomRunStream({
    enabled: import.meta.env.VITE_ENABLE_WEBSOCKETS === 'true',
    wsUrl,
    tenantId: import.meta.env.VITE_DEV_TENANT_ID || import.meta.env.VITE_TENANT_ID || 'authenticated-tenant',
    authMode: import.meta.env.VITE_WEBSOCKET_AUTH_MODE || 'ticket',
    ticketUrl: `${apiBaseUrl}/api/realtime/websocket-ticket`,
    ticketHeaders: requestHeaders,
    focusedRunIds: focusedRunId ? [focusedRunId] : [],
    onDashboardInvalidated: () => setDashboardRefresh(value => value + 1),
    onRunTransition: handleRunTransition,
    replayRunEvents,
    loadRun,
    onError: error => console.warn('Atom live stream unavailable; HTTP refresh remains active.', error.message)
  });

  const generateTest = async () => {
    if (!prompt.trim()) return;

    try {
      setIsGenerating(true);
      const response = await fetch(`${apiBaseUrl}/api/generate/test`, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({
          prompt: prompt.trim(),
          testType: 'ui',
          options: {}
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate test');
      }

      const generatedTest = await response.json();
      setCurrentTest(generatedTest);
      setIsGenerating(false);
    } catch (error) {
      console.error('Error generating test:', error);
      setIsGenerating(false);
    }
  };

  const executeTest = async () => {
    if (!currentTest) return;

    try {
      const sessionId = `session-${Date.now()}`;
      
      setExecutionError(null);
      const response = await fetch(`${apiBaseUrl}/api/execute/test`, {
        method: 'POST',
        headers: { ...requestHeaders, 'Idempotency-Key': `ui-${crypto.randomUUID()}` },
        body: JSON.stringify({
          testData: currentTest,
          sessionId
        }),
      });

      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        throw new Error(failure.error || 'Failed to execute test');
      }
      const submission = await response.json();
      const runId = submission.run?.id || null;
      setFocusedRunId(runId);
      setExecutionEvent({ type: 'execution-submitted', payload: { ...submission.run, runId, state: submission.status } });
      setDashboardRefresh(value => value + 1);
      setIsExecuting(true);

      // Lifecycle events continue through the tenant-authorized run stream when WebSockets are enabled.
    } catch (error) {
      console.error('Error executing test:', error);
      setIsExecuting(false);
      setExecutionError(error.message || 'The test could not be submitted.');
    }
  };

  const examplePrompts = [
    "Test the login page with invalid credentials and verify error message",
    "Check if the signup API returns 404 for missing required fields",
    "Test file upload functionality on Safari browser",
    "Verify responsive design on mobile viewport for homepage",
    "Test payment form validation with various input scenarios"
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm dark:bg-slate-900/80 sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950">
                <img src={atomLogo} alt="Atom logo" className="h-full w-full object-cover" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
                  ATOM
                </h1>
                <p className="text-sm text-muted-foreground">Automated Testing and Orchestration Mesh</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <Badge variant={stream.connected ? "default" : "secondary"} className="flex items-center space-x-1">
                <div className={`w-2 h-2 rounded-full ${stream.connected ? 'bg-green-500' : stream.status === 'disabled' ? 'bg-slate-400' : 'bg-amber-500'}`} />
                <span>{stream.status === 'disabled' ? 'Live off' : stream.connected ? 'Live' : 'Reconnecting'}</span>
              </Badge>
              
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <Cpu className="w-4 h-4" />
                <span>Enterprise Ready</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        <EnterpriseDashboard
          refreshSignal={dashboardRefresh}
          executionEvent={executionEvent}
          focusedRunId={focusedRunId}
          streamStatus={stream.status}
          liveTransitions={liveTransitions}
          onReconnect={stream.reconnectNow}
          onRunSelected={setFocusedRunId}
        />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Panel - Chat Interface */}
          <div className="lg:col-span-1">
            <Card className="h-fit shadow-xl border-0 bg-white/90 backdrop-blur-sm dark:bg-slate-800/90">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center space-x-2">
                  <Bot className="w-5 h-5 text-blue-600" />
                  <span>AI Test Assistant</span>
                </CardTitle>
                <CardDescription>
                  Describe the test you want to create and I'll generate it for you.
                </CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {executionError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-700 dark:border-rose-900/50 dark:bg-rose-900/20 dark:text-rose-200">{executionError}</div>}
                {/* Example Prompts */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Quick Examples:</p>
                  <div className="space-y-2">
                    {examplePrompts.slice(0, 3).map((example, index) => (
                      <Button
                        key={index}
                        variant="ghost"
                        size="sm"
                        className="h-auto p-3 text-left justify-start whitespace-normal text-xs hover:bg-blue-50 dark:hover:bg-slate-700"
                        onClick={() => setPrompt(example)}
                      >
                        "{example}"
                      </Button>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Input Area */}
                <div className="space-y-3">
                  <Textarea
                    placeholder="Describe the test you want to create..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="min-h-[120px] resize-none border-2 focus:border-blue-500 transition-colors"
                  />
                  
                  <div className="flex space-x-2">
                    <Button 
                      onClick={generateTest}
                      disabled={!prompt.trim() || isGenerating}
                      className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                    >
                      {isGenerating ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4 mr-2" />
                          Generate Test
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Current Test Info */}
                {currentTest && (
                  <div className="space-y-3 p-4 bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 rounded-lg border">
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
                      className="w-full bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700"
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
          <div className="lg:col-span-2">
            <Card className="shadow-xl border-0 bg-white/90 backdrop-blur-sm dark:bg-slate-800/90">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center space-x-2">
                    <Terminal className="w-5 h-5 text-green-600" />
                    <span>Test Execution</span>
                  </CardTitle>
                  
                  {isExecuting && (
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      <span className="text-sm text-muted-foreground">Running...</span>
                    </div>
                  )}
                </div>
              </CardHeader>

              <CardContent>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsList className="grid w-full grid-cols-4 mb-6">
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
                        
                        <ScrollArea className="h-[500px] w-full rounded-md border bg-slate-50 dark:bg-slate-900">
                          <pre className="p-4 text-sm">
                            <code>{currentTest.code}</code>
                          </pre>
                        </ScrollArea>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-[500px] text-center space-y-4">
                        <Code className="w-16 h-16 text-muted-foreground/50" />
                        <div>
                          <h3 className="font-semibold text-lg mb-2">No test generated yet</h3>
                          <p className="text-muted-foreground">
                            Enter a prompt and click "Generate Test" to see the code here.
                          </p>
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
                    
                    <ScrollArea className="h-[500px] w-full rounded-md border bg-slate-50 dark:bg-slate-900">
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
                              {testResults.status === 'passed' ? (
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
                                <p className="font-semibold">{Math.round(testResults.duration / 1000)}s</p>
                                <p className="text-sm text-muted-foreground">Duration</p>
                              </div>
                            </div>
                          </Card>
                          
                          <Card className="p-4">
                            <div className="flex items-center space-x-2">
                              <BarChart3 className="w-5 h-5 text-purple-600" />
                              <div>
                                <p className="font-semibold">{testResults.summary?.testCount || 1}</p>
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
                                <div className="font-semibold text-green-600">{testResults.summary.passedCount}</div>
                                <div className="text-muted-foreground">Passed</div>
                              </div>
                              <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                                <div className="font-semibold text-red-600">{testResults.summary.failedCount}</div>
                                <div className="text-muted-foreground">Failed</div>
                              </div>
                              <div className="text-center p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                                <div className="font-semibold text-yellow-600">{testResults.summary.skippedCount}</div>
                                <div className="text-muted-foreground">Skipped</div>
                              </div>
                              <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                <div className="font-semibold text-blue-600">{testResults.summary.testCount}</div>
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
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-12 text-center text-sm text-muted-foreground">
          <div className="flex items-center justify-center space-x-6">
            <div className="flex items-center space-x-2">
              <Shield className="w-4 h-4" />
              <span>Enterprise Security</span>
            </div>
            <div className="flex items-center space-x-2">
              <Globe className="w-4 h-4" />
              <span>Multi-Browser Support</span>
            </div>
            <div className="flex items-center space-x-2">
              <Rocket className="w-4 h-4" />
              <span>AI-Powered Testing</span>
            </div>
          </div>
          <p className="mt-4">
            ATOM v1.0.0 - Automated Testing and Orchestration Mesh
          </p>
        </footer>
      </div>
    </div>
  );
}

export default App;

