# Lumen Ask

Date: 2026-09-20T04:59:40.582Z

## Question

Build a practical study sequence connecting Applied Machine Learning and AI for Engineers to my Senior FDE plan.

## Plan context

Library - the 16 indexed books and 2 build references that make up your study context, which is the same context given to me, plus the 16 external roadmaps used as scaffolding around the plan.

## Answer

Short answer: Prosise's book is a thin production book that pairs cleanly with your Python track. Use it as a side reader for row 28, with light overlap into rows 51 and 59. It does not change your sequence.

What the book actually is, in plain terms
Applied Machine Learning and AI for Engineers by Jeff Prosise is a hands-on engineering book. It walks the reader through the full ML workflow on real examples. The library lists its coverage as machine-learning workflow, data preparation, supervised learning, deep learning, computer vision, NLP, deployment, and responsible AI. Only one chapter index line is recorded: "Chapter 1. Machine Learning." The library has no chapter breakdown beyond that, so the deeper map is not in your repository.

Jargon in plain English
ML workflow means the sequence: frame the problem, get the data, clean it, train a model, test it, deploy it, watch it. That is the spine of every FDE engagement, just with an LLM in the middle.

Concrete technical example
Take one supervised learning chapter and apply it to a tiny classification problem. Pick a tabular dataset, split it into training and test sets, fit a logistic regression with scikit-learn, then read the confusion matrix and the precision-recall curve. That single exercise covers data prep, a model choice, and model evaluation. The same shape shows up in row 104 (model evaluation) and row 28 (production Python architecture).

Why the book maps where it does in your plan
Three rows have a natural fit.

Row 28, Production Python architecture, 14.5h, month 7. This is the row that clears Python as the AI application language at 68% of the market. Prosise's chapters on data preparation, supervised learning, and deployment all use scikit-learn and Keras. Reading those chapters while you build your Python package forces you to treat notebooks and scripts as production code, not toys. Use the book as the source of the small examples; use row 28 as the source of the package shape: domain models, repositories, dependency injection, packaging.

Row 51, Prompt engineering as code, 11.5h, month 12. Less direct, but useful. Prosise covers NLP, which grounds you in tokenisation, vectorisation, and sequence models before row 50 (LLM fundamentals) lands. The historical NLP material is what makes the prompt work feel like engineering instead of magic.

Row 59, Evals as infrastructure, 18h, month 14. Prosise's model evaluation chapter lines up with the cross-validation, leakage, and metric-choice content in row 104, which is the depth behind row 59's eval work. Read Prosise first for vocabulary, then row 104 for rigour, then row 59 for the CI gate.

FDE connection, in plain terms
On a customer engagement, the first artefact you build is rarely an LLM. It is a baseline. A logistic regression, a gradient boosted tree, a simple classifier that proves the data is usable and the metric is honest. Prosise teaches that artefact by example. The book is the rehearsal space for the moment a customer says "we want AI" and you need to respond with "first, let's prove the data can support a model."

How this fits your Senior FDE loop
At Senior level, the FDE is the person who sets the baseline and knows whether the LLM is actually beating it. Prosise gives you that baseline instinct in one read. Without it, your LLM demos are unanchored: you cannot say "the agent is 12 points better than the regression we shipped last week" because you never shipped the regression.

Practical next step
This week, read Prosise Chapter 1 (Machine Learning) and the chapter on data preparation, then start row 28. Build a small Python package that wraps a scikit-learn baseline classifier. Give it a domain model, a repository for loading data, and a CLI entry point. That single package is the reusable artefact you will use in row 53 (agents) and row 54 (RAG) to answer the question "what was the score before the LLM?"

What I am leaving out, and why
I am not assigning specific Prosise chapters to specific rows beyond row 28, row 51, and row 59. The library lists only "Chapter 1. Machine Learning" for this title, so any chapter number beyond that would be invented. If you want a deeper chapter-by-chapter mapping, paste the chapter list from your copy and I will redo it.
