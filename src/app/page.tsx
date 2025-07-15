"use client";

import { useRef, useState, useMemo, useCallback, useEffect } from "react";
import {
  RealtimeAgent,
  RealtimeItem,
  RealtimeSession,
  tool,
} from "@openai/agents/realtime";
import { getSessionToken } from "./server/token";
import z from "zod";

// Survey questions - MCQ + Q2 and Q3 (long-text questions)
const SURVEY_QUESTIONS = [
  {
    id: 1,
    type: "multiple-choice" as const,
    question: "How would you describe the impact of being able to use GenAI in your work? Choose the best answer.",
    options: [
      "It has fundamentally changed the way I work",
      "I have been able to achieve notable results and improvements", 
      "It has enhanced my work in meaningful ways",
      "I have applied some concepts but haven't seen major benefits yet",
      "I have not been able to apply it in my work"
    ]
  },
  {
    id: 2,
    question: "Briefly describe how you use GenAI now. Give an example of a problem that you have solved using GenAI that impacted the citizens you serve. Describe the steps you took to solve that problem. If you aren't using GenAI, please help us understand why not.",
    type: "long-text" as const,
  },
  {
    id: 3,
    question: "Do you have any additional feedback or insights to share about your experience applying GenAI?",
    type: "long-text" as const,
  },
];

export default function Home() {
  const [responses, setResponses] = useState<Record<number, string>>({});
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [history, setHistory] = useState<RealtimeItem[]>([]);
  const session = useRef<RealtimeSession | null>(null);

  // Update response function
  const updateResponse = useCallback((questionId: number, answer: string) => {
    console.log(`Updating response for question ${questionId}:`, answer);
    setResponses(prev => ({ ...prev, [questionId]: answer }));
  }, []);

  // Function to handle option selection for MCQ
  const handleOptionSelect = (questionId: number, option: string) => {
    console.log(`[MCQ] User selected option for question ${questionId}:`, option);
    updateResponse(questionId, option);
    console.log(`[MCQ] Responses after MCQ selection:`, responses);
  };

  const isComplete = Object.keys(responses).length === SURVEY_QUESTIONS.length;

  // Debug: Log current state
  console.log("Current state:", {
    responses,
    isComplete,
    connected
  });

  // Tool to record survey answers
  const recordSurveyAnswer = tool({
    name: "recordSurveyAnswer",
    description: "Record a survey answer for a specific question",
    parameters: z.object({
      questionId: z.number().describe("The ID of the question being answered (1, 2, or 3)"),
      answer: z.string().describe("The answer provided by the user"),
      questionType: z.enum(["multiple-choice", "long-text"]).describe("The type of question being answered"),
    }),
    execute: async ({ questionId, answer, questionType }: { questionId: number; answer: string; questionType: "multiple-choice" | "long-text" }) => {
      console.log(`[RECORD] Recording answer for question ${questionId}:`, answer);
      console.log(`[RECORD] Question type: ${questionType}`);
      
      // Update the survey responses
      updateResponse(questionId, answer);
      console.log(`[RECORD] Answer saved to responses[${questionId}]`);
      
      return `Answer recorded successfully for question ${questionId}. ${questionType === "long-text" ? "Thank you for the detailed response!" : "Great choice!"}`;
    },
  });

  // Use ref to track current responses state for tools
  const responsesRef = useRef(responses);
  responsesRef.current = responses;

  // Tool to get current survey status - uses ref for fresh state
  const getSurveyStatus = useMemo(() => tool({
    name: "getSurveyStatus",
    description: "Get the current status of the survey including which questions have been answered",
    parameters: z.object({}),
    execute: async () => {
      // Get fresh responses state from ref
      const currentResponses = responsesRef.current;
      const completedQuestions = Object.keys(currentResponses).length;
      const isComplete = completedQuestions === SURVEY_QUESTIONS.length;
      
      console.log(`[GET_STATUS] Current responses state:`, currentResponses);
      console.log(`[GET_STATUS] Completed questions: ${completedQuestions}/${SURVEY_QUESTIONS.length}`);
      
      const result = {
        totalQuestions: SURVEY_QUESTIONS.length,
        completedQuestions,
        isComplete,
        responses: currentResponses,
        questionsStatus: SURVEY_QUESTIONS.map(q => ({
          questionId: q.id,
          question: q.question,
          type: q.type,
          answered: !!currentResponses[q.id],
          answer: currentResponses[q.id] || null
        }))
      };
      
      console.log(`[GET_STATUS] Returning status:`, result);
      return result;
    },
  }), []);

  // Create survey agent with tools - memoized to prevent recreation
  const surveyAgent = useMemo(() => {
    const completedQuestions = Object.keys(responses).length;
    const isComplete = completedQuestions === SURVEY_QUESTIONS.length;
    
    return new RealtimeAgent({
      name: "Survey Assistant",
      instructions: `You are a voice based professional GenAI Impact Survey Assistant that drives the conversation forward and STAYS STRICTLY ON TOPIC. Your role is to help users complete this survey about Generative AI impact in government work by having a conversation with them and recording their answers.

      IMPORTANT - STAY ON TOPIC:
      - You ONLY discuss the GenAI Impact Survey questions and responses
      - Do NOT engage in any off-topic conversations
      - If users try to discuss other topics, politely redirect them back to the survey
      - Say something like: "I'm here specifically to help with the GenAI Impact Survey. Let's focus on completing your responses to the survey questions."
      - Do NOT provide general AI assistance, jokes, or discussion unrelated to the survey

      DYNAMIC SURVEY STATUS:
      - Always use the getSurveyStatus tool to get the current, up-to-date survey status
      - Do NOT rely on any hardcoded status information - responses may change during the conversation
      
      ALL QUESTIONS AVAILABLE:
      ${SURVEY_QUESTIONS.map((q, i) => `
      Question ${i + 1} (ID: ${q.id}): "${q.question}"
      Type: ${q.type}
      ${q.type === "multiple-choice" ? `Options: ${q.options?.map((opt, j) => `${j + 1}. ${opt}`).join("; ")}` : ""}
      Status: Use getSurveyStatus tool to check current answer
      `).join("\n")}

      IMPORTANT - FORM-BASED INTERACTION:
      - Users can interact with ANY question at ANY time - there's no "current question"
      - Question 1 (Multiple Choice): Users click option buttons in the UI - DO NOT ask them for their answer instead prompt them to ans the question in the ui (its an MCQ)
      - Questions 2 & 3 (Long Text): Users can BOTH type manually AND use voice interaction to ans this
      - When users speak about long-text questions, save their responses using recordSurveyAnswer
      - Users can edit their typed responses at any time - the voice assistant can also modify existing text
      
      IMMEDIATE GREETING (SAY THIS AS SOON AS YOU CONNECT):
      "Hello! I'm here to help you complete the GenAI Impact Survey. You have 3 questions to work with, and you can answer them in any order. For the multiple choice question (Q1), use the buttons. For the detailed questions (Q2 & Q3), you can either type directly in the text areas or speak to me - I'll fill them out for you! Let me check your current progress..."
      
      THEN IMMEDIATELY: Use getSurveyStatus tool to check current progress and provide specific guidance based on what's completed. start with the next question that is not answered.

      FOLLOW-UP QUESTION STRATEGY:
      For Multiple Choice Questions (Q1):
      - Redirect users to use the UI buttons: "Please use the buttons in the interface to select your answer for the multiple choice question."
      - Do NOT use recordSurveyAnswer for multiple choice questions
      
      For Long-Text Questions (Q2 & Q3):
      - Users can both type and speak their answers
      - If they give very brief answers, probe for more details
      - If users have already typed something, acknowledge it: "I see you've started typing for Question X. Would you like me to add to what you've written or replace it entirely?"
      - Ask maximum 1-2 follow-up questions per question to avoid being pushy
      - Once you get a reasonably detailed response, record it using recordSurveyAnswer

      SURVEY WORKFLOW:
      - Users can work with any question at any time through typing or voice
      - Use getSurveyStatus to check current status if needed
      - For Question 1 (multiple choice): Redirect to UI buttons, do NOT use tools to save answers
      - For Questions 2 & 3 (long-text): Record detailed responses using recordSurveyAnswer (this will update both the stored response and the text field in the ui)
      - IMPORTANT: When recording answers, use the correct parameters:
        * Question 2 (about how you use GenAI) = questionId: 2, questionType: "long-text"  
        * Question 3 (about additional feedback) = questionId: 3, questionType: "long-text"
      - If users want to change answers, use recordSurveyAnswer to update (works for both voice and manual edits)
      - Once the conversation is complete, use recordSurveyAnswer to save the answers and then say "Thank you for your responses! You can review or modify any of your responses at any time using either the text fields or by speaking to me. And to end the conversation ask the user to click the Stop Voice Assistant button"
      
      RESPONSE STYLE:
      - you are a voice based assistant, so please use proper punctuation, sentence structure and tone of voice
      - Drive the conversation forward, don't let it stall -- give the user options to continue the conversation based on pending questions recommend the next question the user should answer offer to ask that question to the user.
      - Be conversational but professional
      - Help users navigate between questions naturally
      - Show genuine interest in their experiences
      - Thank them for their responses
      `,
      tools: [recordSurveyAnswer, getSurveyStatus],
    });
  }, [responses, recordSurveyAnswer, getSurveyStatus]);

  // Update agent when responses change and session is active
  useEffect(() => {
    if (connected && session.current) {
      console.log("Survey responses updated - agent will reflect changes on next query");
      // The agent will be updated automatically since it's memoized with responses dependency
      // and the tools (getSurveyStatus) will return the latest state when called
    }
  }, [responses, connected]);

  async function onConnect() {
    // Prevent multiple concurrent connection attempts
    if (connecting) {
      console.log("Connection already in progress, ignoring click");
      return;
    }

    if (connected) {
      // Disconnecting
      setConnecting(true);
      try {
        setConnected(false);
        await session.current?.close();
        session.current = null;
        console.log("Voice agent disconnected successfully");
      } catch (error) {
        console.error("Error disconnecting:", error);
      } finally {
        setConnecting(false);
      }
    } else {
      // Connecting
      setConnecting(true);
      try {
        const token = await getSessionToken();
        session.current = new RealtimeSession(surveyAgent, {
          model: "gpt-4o-realtime-preview-2025-06-03",
        });
        
        session.current.on("history_updated", (history) => {
          setHistory(history);
        });
        
        await session.current.connect({
          apiKey: token,
        });
        setConnected(true);
        console.log("Voice agent connected successfully");
        
        // Show user guidance notification
        setTimeout(() => {
          alert("🎤 Voice Assistant is ready! Say 'Hello' or start speaking about any question to begin your conversation.");
        }, 500);
        
      } catch (error) {
        console.error("Failed to connect:", error);
        setConnected(false);
        session.current = null;
      } finally {
        setConnecting(false);
      }
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-4">
              GenAI Impact Survey
            </h1>
            <p className="text-xl text-gray-600 mb-6">
              Voice-powered survey about Generative AI impact in government work
            </p>
            {/* Progress Bar */}
            <div className="max-w-md mx-auto">
              <div className="flex justify-between text-sm text-gray-500 mb-2">
                <span>Progress</span>
                <span>{Object.keys(responses).length} of {SURVEY_QUESTIONS.length} completed</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-purple-500 h-3 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${(Object.keys(responses).length / SURVEY_QUESTIONS.length) * 100}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Voice Connection */}
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-8 border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold text-gray-800 flex items-center">
                <span className="mr-2">🎤</span> Voice Assistant
              </h2>
              <div className="flex items-center space-x-3">
                <div className={`w-4 h-4 rounded-full transition-colors ${
                  connecting ? 'bg-yellow-500 animate-spin' : connected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
                }`}></div>
                <span className="text-sm font-medium text-gray-600">
                  {connecting ? 'Connecting...' : connected ? 'Connected & Ready' : 'Disconnected'}
                </span>
              </div>
            </div>
            
            <button
              onClick={onConnect}
              disabled={connecting}
              className={`w-full py-4 px-6 rounded-xl font-semibold text-white transition-all duration-200 ${
                connecting
                  ? "bg-gray-500 cursor-not-allowed opacity-75"
                  : connected
                    ? "bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 shadow-lg transform hover:scale-105"
                    : "bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 shadow-lg transform hover:scale-105"
              }`}
            >
              {connecting 
                ? "⏳ Connecting..." 
                : connected 
                  ? "🛑 Stop Voice Assistant" 
                  : "🚀 Start Voice Assistant"
              }
            </button>
            
            <div className="mt-4 p-3 bg-blue-50 rounded-lg border-l-4 border-blue-400">
              <p className="text-sm text-blue-700">
                <strong>How to use:</strong> Click "Start Voice Assistant" then say "Hello" to begin. For multiple choice (Q1), use buttons. For detailed questions (Q2 & Q3), type or speak your answers.
              </p>
            </div>
          </div>

          {/* Two Column Layout - Survey left, Chat right */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 h-[calc(100vh-300px)]">
            
            {/* Left Column: Survey Questions */}
            <div className="flex flex-col bg-white rounded-l-2xl shadow-xl border-r-2 border-gray-200 pr-4">
              <div className="p-6 border-b bg-gradient-to-r from-blue-50 via-indigo-50 to-green-50 rounded-tl-2xl">
                <h2 className="text-2xl font-semibold text-gray-800 flex items-center">
                  <span className="mr-2">📝</span> Survey Questions
                  <span className="ml-auto text-sm bg-blue-100 text-blue-800 px-3 py-1 rounded-full">
                    {Object.keys(responses).length} of {SURVEY_QUESTIONS.length} completed
                  </span>
                </h2>
              </div>
              
              {/* Scrollable Questions Container */}
              <div className="flex-1 overflow-y-scroll p-6 space-y-6" style={{scrollbarWidth: 'auto', scrollbarColor: '#cbd5e0 #f7fafc'}}>
              {/* Questions List */}
              {SURVEY_QUESTIONS.map((question, index) => (
                <div 
                  key={question.id} 
                  className={`bg-white rounded-2xl shadow-xl border transition-all duration-200 ${
                    responses[question.id] ? 'border-green-500 shadow-2xl' : 'border-gray-100 hover:shadow-2xl hover:border-gray-200'
                  }`}
                >
                  <div className={`p-6 rounded-2xl ${
                    responses[question.id] ? 'bg-gradient-to-r from-green-50 to-emerald-50' : ''
                  }`}>
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                          <span className="bg-blue-100 text-blue-800 text-sm font-medium px-3 py-1 rounded-full mr-3">
                            Q{index + 1}
                          </span>
                          {responses[question.id] && (
                            <span className="text-sm bg-green-500 text-white px-3 py-1 rounded-full">
                              ✅ Answered
                            </span>
                          )}
                        </h3>
                        <p className="text-gray-700 leading-relaxed text-lg mb-4">{question.question}</p>
                        
                        {/* Question Type Indicator */}
                        <div className="mb-4">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                            question.type === "multiple-choice" 
                              ? "bg-yellow-100 text-yellow-800" 
                              : "bg-green-100 text-green-800"
                          }`}>
                            {question.type === "multiple-choice" ? "🔘 Multiple Choice" : "✍️ Detailed Response"}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center ml-4">
                        {responses[question.id] ? (
                          <div className="text-green-600">
                            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          </div>
                        ) : (
                          <div className="text-gray-400">
                            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                            </svg>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* MCQ Options */}
                    {question.type === "multiple-choice" && (
                      <div className="mb-6 space-y-3">
                        <h4 className="font-medium text-gray-700 mb-3">Select your answer:</h4>
                        {question.options?.map((option, optionIndex) => (
                          <button
                            key={optionIndex}
                            onClick={() => handleOptionSelect(question.id, option)}
                            className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 transform hover:scale-102 ${
                              responses[question.id] === option
                                ? "border-blue-500 bg-blue-50 text-blue-800 shadow-md"
                                : "border-gray-200 hover:border-blue-300 hover:bg-blue-50"
                            }`}
                          >
                            <div className="flex items-center">
                              <span className="font-medium text-gray-600 mr-3 bg-gray-100 rounded-full w-8 h-8 flex items-center justify-center text-sm">
                                {optionIndex + 1}
                              </span>
                              <span className="flex-1">{option}</span>
                              {responses[question.id] === option && (
                                <svg className="w-5 h-5 text-blue-500 ml-2" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    
                    {/* Long-text Input Field */}
                    {question.type === "long-text" && (
                      <div className="mb-6 space-y-4">
                        <h4 className="font-medium text-gray-700">Your response:</h4>
                        <textarea
                          value={responses[question.id] || ""}
                          onChange={(e) => updateResponse(question.id, e.target.value)}
                          placeholder="Type your response here..."
                          className="w-full p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-all duration-200"
                          rows={6}
                        />
                        <div className="flex justify-between items-center text-sm text-gray-500">
                          <span>✍️ Type here or 🎤 use voice assistant</span>
                          <span>{responses[question.id]?.length || 0} characters</span>
                        </div>
                      </div>
                    )}
                    
                    {/* Answer Status */}
                    <div className="mb-4">
                      {responses[question.id] ? (
                        <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-xl border-l-4 border-green-400">
                          <h4 className="font-medium text-green-800 mb-2 flex items-center">
                            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Answer Status: Complete
                          </h4>
                          <p className="text-green-700 text-sm">
                            {question.type === "multiple-choice" 
                              ? `Selected: "${responses[question.id]}"` 
                              : `${responses[question.id].length} characters entered`
                            }
                          </p>
                          <button
                            onClick={() => updateResponse(question.id, "")}
                            className="mt-2 text-sm text-green-600 hover:text-green-800 underline transition-colors"
                          >
                            Clear answer to start over
                          </button>
                        </div>
                      ) : (
                        <div className="bg-gray-50 p-4 rounded-xl border-l-4 border-gray-300">
                          <p className="text-gray-500 italic">Not answered yet</p>
                          <p className="text-blue-600 text-sm mt-2 flex items-center">
                            <span className="mr-2">💡</span>
                            {question.type === "multiple-choice" 
                              ? "Click an option above"
                              : "Ready when you are!"
                            }
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Survey Complete Message */}
              {isComplete && (
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl shadow-xl p-8 border border-green-200">
                  <div className="text-center">
                    <div className="text-6xl mb-4">🎉</div>
                    <h2 className="text-3xl font-bold text-green-800 mb-4">Survey Complete!</h2>
                    <p className="text-green-700 text-lg mb-6">Thank you for sharing your insights about GenAI impact in government work.</p>
                    <button
                      onClick={() => {
                        const responseText = SURVEY_QUESTIONS.map((q, i) => 
                          `Question ${i + 1}: ${q.question}\n\nResponse: ${responses[q.id] || "No response provided"}\n\n---\n\n`
                        ).join('');
                        navigator.clipboard.writeText(responseText);
                        alert("Survey responses copied to clipboard!");
                      }}
                      className="bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 transform hover:scale-105"
                    >
                      📋 Copy Responses
                    </button>
                  </div>
                </div>
              )}
              </div>
            </div>

            {/* Right Column: Conversation History */}
            <div className="flex flex-col bg-white rounded-r-2xl shadow-xl pl-4">
              <div className="p-6 border-b bg-gradient-to-r from-green-50 via-emerald-50 to-green-50 rounded-tr-2xl">
                <h2 className="text-2xl font-semibold text-gray-800 flex items-center">
                  <span className="mr-2">💬</span> Voice Conversation
                  {history.filter(item => item.type === "message").length > 0 && (
                    <span className="ml-auto text-sm bg-green-100 text-green-800 px-3 py-1 rounded-full">
                      {history.filter(item => item.type === "message").length} messages
                    </span>
                  )}
                </h2>
              </div>
              
              <div className="flex-1 overflow-y-scroll p-6" style={{scrollbarWidth: 'auto', scrollbarColor: '#cbd5e0 #f7fafc'}}>
                {history.filter(item => item.type === "message").length === 0 ? (
                  <div className="text-center py-16">
                    <div className="text-6xl mb-6">🎤</div>
                    <h3 className="text-xl font-semibold text-gray-700 mb-3">Ready for Voice Conversation</h3>
                    <p className="text-gray-500 text-lg mb-2">Your conversation with the AI assistant will appear here</p>
                    <p className="text-gray-400 text-sm max-w-md mx-auto">
                      {connected 
                        ? "Say 'Hello' or start speaking about any question to begin your conversation" 
                        : "Click 'Start Voice Assistant' above to begin"
                      }
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {history
                      .filter((item) => item.type === "message")
                      .map((item, index) => {
                        // Type guard to ensure item is a message
                        if (item.type !== "message") return null;
                        
                        const isUser = item.role === "user";
                        
                        return (
                          <div key={index} className={`flex items-start space-x-4 ${isUser ? "flex-row-reverse space-x-reverse justify-start" : "justify-start"}`}>
                            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg font-medium ${
                              isUser 
                                ? "bg-blue-100 text-blue-600" 
                                : "bg-green-100 text-green-600"
                            }`}>
                              {isUser ? "👤" : "🤖"}
                            </div>
                            <div className={`rounded-2xl p-4 shadow-sm ${
                              isUser
                                ? "bg-blue-50 border-l-4 border-blue-400 max-w-xl"
                                : "bg-green-50 border-l-4 border-green-400 max-w-2xl"
                            }`}>
                              <div className={`text-xs font-medium mb-2 ${
                                isUser ? "text-blue-600" : "text-green-600"
                              }`}>
                                {isUser ? "You" : "AI Assistant"}
                              </div>
                              <div className="text-gray-800 leading-relaxed">
                                {(() => {
                                  // Handle string content (most common case)
                                  if (typeof item.content === "string") {
                                    return <p>{item.content}</p>;
                                  } 
                                  
                                  // Try to extract text/transcript from complex content structures
                                  let extractedText = "";
                                  
                                  try {
                                    const content = item.content as any;
                                    
                                    // Handle array content
                                    if (Array.isArray(content)) {
                                      for (const contentItem of content) {
                                        if (contentItem?.transcript) {
                                          extractedText = contentItem.transcript;
                                          break;
                                        }
                                        if (contentItem?.text) {
                                          extractedText = contentItem.text;
                                          break;
                                        }
                                      }
                                    }
                                    // Handle object content
                                    else if (content?.transcript) {
                                      extractedText = content.transcript;
                                    }
                                    else if (content?.text) {
                                      extractedText = content.text;
                                    }
                                    
                                    if (extractedText) {
                                      return <p>{extractedText}</p>;
                                    }
                                  } catch (error) {
                                    console.log("Error extracting message content:", error);
                                  }
                                  
                                  // Fallback - show processing message
                                  return <p className="text-gray-500 italic">🎤 Processing voice message...</p>;
                                })()}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
