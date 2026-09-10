# Lumen Ask

Date: 2026-09-10T08:00:07.136Z

## Question

what all can we do from my end - can u explain me like a kid in the sense of GTM as well?

## Plan context

A. Linux, Networking, Shell | Shell mastery and scripting | Write a 200-line bash tool with set -euo pipefail, traps, getopts, logging and tests, without looking anything up | resources: The Linux Command Line (William Shotts), MIT The Missing Semester (lectures 1-5, 7), OverTheWire Bandit (levels 0-33)
A. Linux, Networking, Shell | Linux internals: processes, systemd, permissions, filesystems, packaging | Explain what happens from boot to a systemd service serving traffic; diagnose a stuck process from /proc | resources: Linux Journey (all of Grasshopper and Journeyman), freeCodeCamp.org: Linux Server Course - System Configuration and Operation, SadServers (scenarios, easy to medium)
A. Linux, Networking, Shell | Networking: TCP/IP, DNS, TLS, HTTP/2, load balancers, firewalls | Trace a request from DNS to TLS handshake to response and name every hop; debug a failed webhook with tcpdump | resources: High Performance Browser Networking (ch 1-4, 12-13), Hussein Nasser: Network Engineering, Protohackers (network programming challenges)
A. Linux, Networking, Shell | Performance and troubleshooting on a single box | Use the USE method; read top, vmstat, iostat, strace and perf output and say what is wrong | resources: Brendan Gregg: Linux Performance page and USE method, Brendan Gregg: Linux Performance Tools (talk), SadServers (hard scenarios)
A. Linux, Networking, Shell | Git at depth: rebase, bisect, reflog, hooks, monorepo hygiene | Recover a lost commit, bisect a regression, rewrite history safely | resources: Pro Git (ch 1-3, 7), Missing Semester: Version Control (git) lecture, Learn Git Branching (all levels)
B. Containers and Kubernetes | Docker internals: namespaces, cgroups, layers, networking | Explain a container without the word 'lightweight VM'; draw the layer cache; debug a bridge network issue | resources: Docker docs: Get started and Engine concepts, TechWorld with Nana: Docker Tutorial for Beginners [FULL COURSE in 3 Hours], Play with Docker
B. Containers and Kubernetes | Production images and supply chain: multi-stage, non-root, SBOM, scanning, signing | Ship an image under 200 MB, non-root, zero HIGH CVEs, with an SBOM | resources: Docker: Building best practices, Civo: Mastering Container and Image Security with Bret Fisher@BretFisher, Trivy (scan, SBOM) on your own images
B. Containers and Kubernetes | Kubernetes core: Pod, Deployment, Service, Ingress, ConfigMap, Secret, namespaces | Draw the object model from memory; explain how a request reaches a Pod through Ingress and Service | resources: Kubernetes docs: Concepts, TechWorld with Nana: Kubernetes Tutorial for Beginners [FULL COURSE in 4 Hours], Killercoda Kubernetes scenarios

## Answer

# What you can do from your end, in plain English

You are sitting in Pune with a 24-month plan in front of you and a market where almost half of the top-paying FDE jobs require a US move. Your end of the rope is the part you control without anyone's permission. The GTM part means go-to-market: how a candidate finds the company, the job, and the interview loop, not how the company finds its customers. This answer walks both halves together because they share the same work.

## The GTM meaning in your position

In a real startup, go-to-market is the motion of getting the product in front of a buyer. For a job seeker, the same word covers the motion of getting your name in front of a hiring manager. The four pillars are the same ones a salesperson uses: who you are selling to, what you are selling, what proof you have it works, and what channel you use to reach them.

1. Target list. The 40 companies in the plan. Pune-employable today for this market: 6 requisitions across the data-platform segment, 3 in agent engineer, 2 in frontier-lab applied, 1 in deployment strategist, 0 in inference infrastructure. Use the segment-fit table as your bucket, not the company logos you hear about on podcasts.
2. Positioning. The three lines you lead with on LinkedIn, in your intro email, and in your resume summary. These three lines have to map to the top three skills in the corpus: Python as the AI application language (68% of core FDE requisitions), Customer-site travel expectation (45% of core FDE requisitions), Evals and evaluation frameworks (42%). Everything else is a tiebreaker.
3. Public proof. Three case studies with a repo, a write-up, and a 3-minute video each. This is what makes the recruiter call you back instead of filing you under "another applicant."
4. Channel. Referral, warm intro, recruiter screen, cold email, job board apply. Their hit rates are very different and you should know which before you press send.

## What only you can do from your end

### Learning craft, in the right order

The plan already orders work by readiness gain per hour, not by interest. Right now your single highest readiness gain per hour is row 28, "Production Python architecture: domain models, repositories, DI, packaging" at 14.5h. It alone takes you from 0% to 14% of the market because Python as the AI application language is asked for in 68% of 192 requisitions across 16 of 21 companies. Any week you spend on "let me finish the maths first" is a week the loop is sitting empty for no measured reason. The maths rows 94 to 100 have a 0% surface match in the corpus. The plan still wants you to do them, but in months that fit, not before row 28.

Two craft moves that improve every other row without adding hours:

- Write a one-page triage card for the Linux row 4, save it in your repo. This makes the next FDE take-home doable. Five minutes of typing replaces an hour of "where is that article I half-read."
- Write a two-sentence summary for every row you finish, paste it at the top of your notes file. Six months from now you will not remember what row 59 covered, and the summary becomes the only search handle you trust.

### Positioning, in one go

Pick your three lines now, before you need them. A template:

Line 1: the role.
"Forward-deployed engineer building production AI systems for [segment] customers, especially [two specific problems]."

Line 2: the proof.
"Last built [artifact] for [shape of customer]; repo at [url], write-up at [url], demo at [url]."

Line 3: the constraint the market measures.
"Open to [takeable from Pune today / open to relocation to [city] / open to 30% US travel]."

If you cannot fill any line with a real sentence, that sentence is a learning target, not a positioning decision. For most learners, line 2 is the empty one. That is exactly why the case studies in row 89 sit where they do.

### Public proof, in three shapes

Each of the three case studies should be the same shape so a recruiter can read all three in 12 minutes:

- A 300-line repo with a real build command, tests, a Dockerfile, and a one-paragraph README that says what problem, what stack, what the failure modes are.
- A 1,200-word write-up with five sections: problem, what I built, what I broke, what I learned, what I would do differently. The "what I broke" line is what makes engineers send the email to a friend. The "what I learned" line is what non-engineers screenshot.
- A 3-minute screencast where you walk the repo, run the thing, and explain one decision in depth. Reuse the screencast proof-of-work structure from row 4: break your own VM, diagnose it on camera, write the triage card on camera.

The plan names three case studies and one Hermes write-up in the Portfolio track. Treat the Hermes write-up as case study number four, with a faster turnaround because the audience already knows the domain.

### Channels, in order of expected yield

A referral from a current employee in the right segment beats every other channel by a wide margin. Three hires the dataset can see in the corpus each came in through someone who already worked there. The mechanics are: find the hiring manager on LinkedIn, find a second-degree connection, ask for a 15-minute "advice" call not a referral, end the call by asking if they would introduce you to the hiring manager. This is the same motion the FDE uses with the customer, by design.

A warm intro from a recruiter who has placed at the company before is the next best. The recruiters for Databricks, Anthropic and Observe (the three named Pune-takeable postings in the market block) all post on LinkedIn with the requisition ID. Send a 100-word note referencing the JD by line, your two-line positioning summary, and one link to your strongest case study. No cover letter beyond that.

A recruiter screen at a search firm that has a contract with that company is slower but real. A direct cold email to a hiring manager works about 2% of the time and only if the email is short, names a specific project from the JD, and asks one question.

A job board apply with no referral works about 1% of the time in this market. Use it only to keep the apply-wave counter moving and only on the takeable-without-leaving-India list, never on the out-of-reach list.

### Apply waves, not apply streams

The plan's row 92 covers this explicitly because most learners apply in a stream: one a week for six months. The wave shape is different: in a single month, apply to 8 of the 12 takeable postings in parallel, run their loops in parallel, use each interview to refine the next. Three or four loops running at once is the design, because a single loop takes six to twelve weeks and the plan is shorter than four loops back to back.

The market scan says 12 of 192 postings are takeable from Pune today. That is the only number in the corpus that is a hard ceiling. Every wave you run inside those 12 postings or inside the 6 additional Indian-office postings is the ceiling your end can realistically hit before one of three things opens the larger pool: a relocation offer, a US stamp, or a senior FDE role that fully moves you into the top compensation band.

### Recall and practice, in 5 minutes a day

You have 23 months left and recall is paused today, not piling up. The recall habit at this stage is not about volume. It is about keeping one slot warm so that rows 28, 81, 59, 53 and 57 each have a recall entry on the day you finish them. If you skip the habit now and re-start it in month 14, the first month of recall back is the painful one and you'll skip it again. Five minutes today is cheaper than five days in month 14.

### Compensation calibration, in one table

The compensation reality block in the dashboard is your own data file, not market consensus, so quote it as such. The lines that matter for an end-from-Pune decision:

- India, domestic AI startups and GCCs at 3 to 6 years experience is ₹28 to 55 LPA. The plan calls this realistic in 3 to 6 months from now, which means it is the floor and the only band that does not require a job move.
- India, global-remote senior FDE is roughly ₹55 to 90 LPA for a remote-first US or EU company paying dollar-linked. The plan calls this realistic in 6 to 9 months with strong public proof. The variable is the public proof, which is your action.
- US lab or top startup on-site is $180,000 to $550,000 total comp depending on company and experience, and is realistic at 24 to 36 months after one US-market FDE role. This is the line that does not move from your end. It moves when a US employer issues an offer.

The $250K target is about ₹2.1 crore and is described in the workbook as "Not a 9-month target from Pune; a 2 to 3 year target with one US-market FDE role in between." Print that line. Tape it next to your desk. Re-read it whenever the temptation to skip the case-study row feels reasonable.

## Concrete technical example of the GTM in motion

Imagine you finish rows 28 and 4 next month. You have a triage card on GitHub and a small repo that hosts a FastAPI service with documented packaging. Your three LinkedIn lines might read:

Line 1: "Forward-deployed engineer focused on production AI systems for data-platform customers: model serving on Kubernetes, evals and incident response."
Line 2: "Most recently shipped a one-box triage card for Linux performance work, repo and write-up linked below."
Line 3: "Open to India-remote and Indian-office FDE roles; explore relocation for the right US-market senior FDE loop."

A recruiter at Databricks reads lines 1 and 2, sees Python plus on-call-shaped work, and the resume moves from the bottom of the stack to a screen call. The Pune-employable count is 6 across the 42 data-platform postings; this is one engineering seat at one company doing the work the corpus asks for. Multiply by row 89's other two case studies and line 2 becomes three artifact URLs, which is the moment recruiters respond same-day.

## How this connects to production systems and FDE interviews

The same motion works inside the interview loop. A take-home build is a production artifact at miniature scale. A screening call measures whether you can be the person who finds the real problem on a customer call. A system design mock measures whether you can be the person a customer trusts with their stack. None of these are decided by what you know. They are decided by what you can show and how you tell the story of it. That is the same problem the GTM motion solves: signal without a referral.

The customer-side analogue is the one-line summary in row 73. When the FDE writes a one-pager that says "the saturated resource is X, the evidence line is Y, the fix is Z", that is the same shape as the recruiter email. One line per signal. One link per proof. One question at the end. The craft on the customer side and the motion on your side are the same work.

## 20-minute exercise: a GTM starter pack in 20 minutes

Setup (one time, before the clock):
Open a single markdown file called `gtm.md` in your repo. Pre-write the three LinkedIn lines with placeholder text where you do not yet have evidence. Open the takeable-without-leaving-India list. Open the readiness percentages table.

The exercise (20 minutes total):

Minutes 0 to 2: read the brief. You will fill in three blocks: positioning summary (5 minutes), case-study back-log (5 minutes), apply wave design (5 minutes), channel list (5 minutes).

Minutes 2 to 7: fill the positioning summary. Three lines, each under 200 characters. Each line maps to one of: role + segment, proof link, constraint. Commit the file at minute 7. If you cannot fill line 2 with a real URL, write `[row 89 case study 1]` instead.

Minutes 7 to 12: write a back-log of three case studies. Each line: title, problem statement, planned stack, planned repo location, planned write-up length, planned screencast length. The shape match is what makes the loop reusable. If you already have one of the three, write "done" instead of the back-log line for it.

Minutes 12 to 17: design one apply wave. Pick four postings from the takeable-without-leaving-India list. For each one, write the four steps you would run in parallel: recruiter email, hiring-manager intro attempt, employee referral attempt, screencast-tailored application. Schedule them in your calendar with the dates that keep three loops moving at once.

Minutes 17 to 20: write the channel list with five entries and the expected yield of each. Use only the channels above with their quoted rough hits. Note one referral target per posting in your wave: someone you would message this week to start the 15-minute advice call.

What "done" looks like:
A 30-line markdown file in your repo with three positioning lines, three case-study lines, four postings in a wave, and a channel list. The file can be opened six weeks later and tell you exactly what to do next Monday morning.

What you will probably get wrong the first time:
You will name the case studies too broadly, the wave will not be parallel, the channel list will not have a specific target per posting. Each of those is a fix that takes one minute the next time you look at the file.

## Practical next step

Block 20 minutes this week, before the next study session, and write the `gtm.md` file. Then open the dashboard's Portfolio track and start row 89, "Public proof: three case studies and repos," at 18h. The 18 hours is the single biggest unlock you can move from your end without anyone's permission, because every other part of the loop, including the take-home build and the system design mock, is downstream of the artifacts it produces. Until row 89 is at least one-third done, your apply-wave has nothing to point at and your recruiter email has nothing to link. After row 89 starts, the next-best action is the positioning summary you wrote today: paste it into LinkedIn, paste it into the resume summary, paste it into the recruiter email signature. One sentence, one job, one wave at a time.

Sources to read next, named not quoted:
- fde.academy, "FDE job descriptions explained" (the corpus is built from the same JDs you are responding to).
- Try Exponent, "FDE interview: the definitive 2026 guide" (the loop's six rounds in plain language).
- Scaler AI FDE detailed curriculum (map only, for gap-checking your case-study topics against what gets asked).
- The FDE interview has six rounds (Medium, July 2026) (specifics on each round's expected artifact).

The outside-context web brief stored in the dashboard is partial: 1 of 3 queries failed and the brief should be treated as a partial view. Its topic is also travel-sector AI adoption, which is adjacent to your segments but is not the corpus that determines your GTM. Cite its URLs only if a reader asks specifically about travel or hospitality AI adoption. The numbers above (readiness, the 12 takeable postings, the segment fit, the compensation bands) are measured for this repository and are unchanged by it.

A live web search was requested for this question and returned no usable results. The answer above is built only from the plan, the index, the benchmark and the partial outside-context brief stored in the dashboard. Treat the absence of a fresh web search as a constraint, not a fact.
