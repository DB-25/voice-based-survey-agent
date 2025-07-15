# Voice-Based Survey Agent

A Next.js application that conducts surveys about Generative AI impact in government work using OpenAI's Realtime Voice API.

## 🚀 Features

- **Voice-powered survey** using OpenAI's Realtime API
- **Interactive UI** with multiple choice and long-text questions
- **Real-time conversation** with AI assistant
- **Progress tracking** and response management
- **Modern responsive design** with Tailwind CSS

## 🛠️ Setup

### Prerequisites

1. **Node.js 18+** - [Download here](https://nodejs.org/)
2. **OpenAI API Account** - [Sign up here](https://platform.openai.com/)
3. **OpenAI API Key** with Realtime API access

### Local Development

1. **Clone and install dependencies:**
   ```bash
   cd voice-based-survey-agent
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env.local
   ```
   
   Edit `.env.local` and add your OpenAI API key:
   ```
   OPENAI_API_KEY=your_actual_api_key_here
   ```

3. **Run the development server:**
   ```bash
   npm run dev
   ```

4. **Open [http://localhost:3000](http://localhost:3000)** in your browser

## 🌐 Deployment

### Deploy to Vercel (Recommended)

1. **Push your code to GitHub**
2. **Connect to Vercel:**
   - Go to [vercel.com](https://vercel.com)
   - Import your GitHub repository
   - Vercel will auto-detect it's a Next.js app

3. **Set environment variables in Vercel:**
   - Go to your project settings
   - Add `OPENAI_API_KEY` with your actual API key

4. **Deploy!** - Your app will be live at `your-app.vercel.app`

### Other Deployment Options

- **Netlify** - Similar process to Vercel
- **Railway** - Great for full-stack apps
- **Render** - Good free tier alternative

## 🔑 API Requirements

This app requires:
- OpenAI API key with billing enabled
- Access to `gpt-4o-realtime-preview` model
- Realtime API quota (check your OpenAI usage limits)

## 📝 How to Use

1. Click "Start Voice Assistant"
2. Say "Hello" to begin the conversation
3. Answer Question 1 using the UI buttons
4. For Questions 2 & 3, type or speak your responses
5. The AI assistant will help guide you through the survey

## 🤝 Contributing

Feel free to submit issues and enhancement requests!

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
