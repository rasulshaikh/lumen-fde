# Lumen Ask

Date: 2026-09-09T20:51:19.562Z

## Question

Which of my indexed books actually helps with the topic I have open?

## Plan context

Overview - headline progress across the plan, hours by month, the single next action, and the by-track breakdown.

## Answer

# Books that help with your open topic

Your next action is row 28, Production Python architecture: domain models, repositories, DI, packaging (14.5h, month 7). Below is every indexed book whose topic list overlaps that row, with the chapter to open and what to look for in it.

"Production Python architecture" means how you structure a real service in Python so it can grow, be tested, and be deployed. Domain models are the nouns of the business (a Customer, an Order). Repositories are the code that talks to the database so the rest of the app does not have to. Dependency injection (DI) means giving a class the things it needs from the outside instead of letting it build them itself. Packaging means turning your code into something pip can install and a container can run.

A concrete example: an FDE ships a FastAPI service that scores customer support tickets. The domain model is a `Ticket` with a `priority` field. A `TicketRepository` class owns the SQL. The scoring class receives the repository through its constructor (that is DI). The whole thing is a `pip`-installable package with a `pyproject.toml`.

In production this is what stops an FDE build from collapsing under its own weight after week two. In an FDE interview it is the answer to "show me how you structure a service you will hand to the customer's team."

## Books with a direct match

Hands-On Machine Learning with Scikit-Learn and PyTorch (Géron)  -  chapter 2, End-to-End Machine Learning Projects. Look for the part that walks through packaging a real project (env, modules, a runnable script). It is ML-flavored, but the project layout lessons transfer directly to production Python services.

Building Machine Learning Powered Applications (Ameisen)  -  chapter 1, From Product Goal to ML Deployment, and chapter 2, Create a Plan. Look for how the author turns a goal into a code structure and a delivery shape. It is the closest match in the catalog to the product-to-architecture thinking FDEs are graded on.

AI Engineering (Huyen)  -  chapter 7, on adapting a foundation model to an application. Look for the architecture sections that show how an AI application is split into modules (retrieval, prompting, evaluation, serving). The same module boundaries are the ones row 28 wants you to draw in plain Python.

Applied Machine Learning and AI for Engineers (Prosise)  -  chapter 1, Machine Learning. Look for the production-engineering framing and how the author treats the move from notebook to service.

Hands-On Machine Learning with Scikit-Learn, Keras, and TensorFlow (Géron, the longer edition)  -  chapter 2 covers end-to-end project layout in the same way as the PyTorch edition. Use whichever edition you have open.

LLM Engineer's Handbook (Iusztin and Labonne)  -  chapters 1 through 3 cover project structure, tooling, and a data pipeline for an LLM application. Look at how the LLM Twin repo is laid out; that layout is a working example of domain models, repositories, DI, and packaging for an AI service.

The Machine Learning Reference PDF (97 pages, local)  -  open the table of contents and look for the sections on ML workflow and modeling workflow. It is short, so treat it as a refresher, not a primary source.

## Books that touch the surrounding terrain

Hands-On Generative AI with Transformers and Diffusion Models (Sanseviero et al.)  -  chapters 1 and 2 cover Hugging Face project layout and tokenizers. Useful for the packaging half (pyproject, env, entry points), not for DI.

Machine Learning: A Probabilistic Perspective (Murphy)  -  chapter 1 (Introduction) frames the modeling workflow. Use it only as background for why the architecture exists.

Pattern Recognition and Machine Learning (Bishop)  -  chapter 1 (Introduction) is the same kind of orientation. Skip unless you want the math framing.

Mathematics for Machine Learning (Deisenroth et al.)  -  chapter 8, When Models Meet Data, and chapter 9, Linear Regression. Open these only if row 28's math edges (loss, gradient step) confuse you; row 28 itself is engineering, not math.

Deep Learning (Goodfellow, Bengio, Courville)  -  chapter 5, Machine Learning Basics, and chapter 6, Deep Feedforward Networks. Same caveat. The estimator and regularization sections are useful background; the rest is overkill for row 28.

## Books that do NOT help with this row

- Artificial Intelligence: A Modern Approach (Russell and Norvig)  -  no match. It is about agents, search, and logic.
- Hey, Whipple, Squeeze This (Sullivan)  -  no match. It is an advertising book.
- Probabilistic Machine Learning: Advanced Topics (Murphy)  -  no match for production Python architecture. Save it for month 18+ inference work.

## A note on the rules I am following

I do not have the text of any of these books in this repository; I am pointing you to chapter names and to the topic each chapter is known to cover. Page numbers and quoted passages would be invented, so I am not giving you any. Open the chapter, look for the heading I named, and read that section.

## Your next step

Spend one hour reading LLM Engineer's Handbook chapter 1 and skimming chapters 2 and 3. The LLM Twin project layout is a working example of the exact pattern row 28 is asking you to learn: a `src/` tree, a `domain/` folder for models, a `repositories/` folder, DI through FastAPI dependencies, and a `pyproject.toml` that installs the whole thing. Then start row 28 by scaffolding your own `pyproject.toml` and an empty `domain/` folder. The book gives you the shape; the row teaches you why the shape holds.
