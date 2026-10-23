# Multi-Agent AI Research System

A full-stack AI research application that uses specialized agents to search the web, read relevant sources, generate structured research reports, and review the final output.

The project combines a Python-based multi-agent workflow with a FastAPI backend and a lightweight frontend built using HTML, CSS, and JavaScript.

## Overview

Research often involves searching multiple sources, understanding relevant information, organizing findings, and reviewing the final report. This project brings these steps together into a single workflow using AI agents.

The user submits a research topic, and the system coordinates the research process to produce a structured report along with critic feedback and available research material.

## Features

- **Multi-Agent Research Workflow:** Separates research into specialized stages.
- **Web Search:** Uses Tavily to discover relevant web content.
- **Source Reading:** Retrieves and processes information from selected web pages.
- **Report Generation:** Produces a structured report based on gathered research.
- **Critic Review:** Evaluates the generated report and provides feedback.
- **FastAPI Backend:** Exposes HTTP API endpoints for the frontend.
- **JSON Responses:** Returns the completed research output in a standard JSON response.
- **Streaming Mode:** Provides workflow events through Server-Sent Events (SSE).
- **Interactive Frontend:** Offers a clean, responsive research workspace.
- **Environment-Based Configuration:** Keeps API credentials in environment variables.

## How It Works

The application follows a sequential research workflow:

1. **User Input:** The user submits a research topic through the frontend or API.
2. **Search Agent:** Searches the web for relevant information using Tavily.
3. **Reader Agent:** Retrieves and processes content from selected URLs.
4. **Writer:** Uses the collected research to generate a structured report.
5. **Critic:** Reviews the report and provides a score, strengths, areas for improvement, and a verdict when returned by the model.
6. **API Response:** FastAPI returns the resulting research data to the frontend in JSON or through an SSE stream.

The workflow depends on the existing pipeline implementation and the outputs returned by the configured tools and language model.

## Architecture

### Backend

- **FastAPI:** Provides HTTP endpoints and request validation.
- **Agents and Chains:** Define the search, reading, writing, and critic components.
- **Pipeline:** Coordinates the research workflow.
- **Tools:** Integrate external services such as Tavily search and webpage scraping.
- **LLM Provider:** Uses OpenRouter through the configured LangChain integration.
- **Environment Configuration:** Loads API keys and model settings from environment variables.

### Frontend

- **HTML5:** Defines the application structure.
- **CSS3:** Provides styling, layout, and responsive design.
- **Vanilla JavaScript:** Handles user interactions, API requests, streaming events, and result rendering.
- **Fetch API:** Communicates with the FastAPI backend.
- **Server-Sent Events (SSE):** Supports streaming workflow events through the streaming endpoint.

## Tech Stack

| Technology | Purpose |
|---|---|
| Python | Backend application logic |
| FastAPI | REST API development |
| LangChain | LLM integration and agent workflow |
| OpenRouter | Language model access |
| Tavily | Web search |
| HTML5 | Frontend structure |
| CSS3 | Styling and responsive layout |
| JavaScript | Frontend functionality and API integration |
| Uvicorn | ASGI server |

## Project Structure

```text
Multi agents system/
├── main.py              # FastAPI application and API endpoints
├── agents.py            # Agent and LLM chain definitions
├── pipeline.py          # Research workflow orchestration
├── tools.py             # Search and webpage tools
├── requirements.txt     # Python dependencies
├── .env                 # Local environment variables (not committed)
└── front end/
    ├── index.html       # Frontend page
    ├── styles.css       # UI styling
    └── js/
        ├── config.js    # Frontend configuration
        ├── api.js       # Standard API requests
        ├── app.js       # Application interactions
        ├── render.js    # Results rendering
        └── streaming.js # SSE stream handling
```

## Getting Started

### Prerequisites

- Python installed on your system.
- Git.
- A Tavily API key.
- An OpenRouter API key.
- A modern web browser.
- Visual Studio Code is recommended for frontend development.

### 1. Clone the Repository

```bash
git clone <repository-url>
cd "Multi agents system"
```

 `<https://github.com/jtomar10/Mr.-Jitesh-Research-Studio-AI-Research-Workspace.git>` repository URL.

### 2. Create a Virtual Environment

```bash
python3 -m venv .venv
source .venv/bin/activate
```

On Windows, activate the environment using:

```bash
.venv\Scripts\activate
```

### 3. Install Dependencies

```bash
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### 4. Configure Environment Variables

Create a `.env` file in the project root and add the credentials and model configuration required by your existing code.

```dotenv
OPENROUTER_API_KEY=your_openrouter_api_key
TAVILY_API_KEY=your_tavily_api_key
```

Set the model identifier according to the configuration used by your implementation. Never commit API keys or other secrets to Git.

### 5. Start the FastAPI Backend

Run the following command from the project root:

```bash
python -m uvicorn main:app --reload
```

### 6. Start the Frontend

Open `front end/index.html` in Visual Studio Code and use the Live Server extension.

Keep the backend running in a separate terminal. The frontend is configured to communicate with the FastAPI server at `http://127.0.0.1:****`.

Ensure the backend CORS configuration allows the origin used by Live Server.

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Checks backend availability |
| POST | `/api/v1/research` | Generates a report and returns JSON |
| POST | `/api/v1/research/stream` | Streams workflow events using SSE |

### Example Request

```json
{
  "topic": "Recent advances in multi-agent AI systems"
}
```

The research endpoints accept a topic and return fields such as the research report, critic feedback, search results, and scraped content, depending on the output provided by the pipeline.

The streaming endpoint uses a POST request and is consumed through the Fetch API's readable response stream.

## Current Limitations

- Research quality depends on the configured language model, retrieved sources, and available evidence.
- External websites may block scraping or return incomplete content.
- LLM-generated reports and critic feedback may contain errors and should be independently verified.
- Streaming progress depends on the events exposed by the current backend implementation; it does not necessarily represent token-by-token generation or live execution of every agent.
- Research history is not persisted unless a storage layer is added.

## Future Improvements

- Add persistent research history.
- Improve source attribution and citation extraction.
- Add retries, timeouts, and more robust error handling.
- Introduce automated tests for the API, tools, and pipeline.
- Add export options for PDF and DOCX reports.
- Improve streaming to expose genuine intermediate pipeline events.
- Add configurable research depth and output formats.

## Contributing

Contributions and suggestions are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Make your changes.
4. Test the application locally.
5. Submit a pull request describing your improvements.

## License

This project is open source and belongs to Jitesh. You are welcome to explore, use, and modify the code.

For redistribution and licensing clarity, a standard open-source license such as the MIT License can be added to the repository.

---

**Built with Python, FastAPI, LangChain, OpenRouter, Tavily, HTML, CSS, and JavaScript.**