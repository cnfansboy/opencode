import { db } from "./db"

const COURSES = [
  {
    slug: "ks2-maths-foundations",
    title: "KS2 Maths Foundations",
    subject: "Maths",
    stage: "ks2",
    summary: "Number confidence, times tables and problem solving for Years 3-6.",
    description:
      "Small-group and one-to-one sessions that rebuild number confidence from the ground up. We work through the KS2 national curriculum at the pace the child needs, with plenty of practical apparatus and low-stakes practice.",
    price_pence: 2800,
    session_length: "45 minutes, weekly",
    exam_boards: "National curriculum",
    topics: [
      "Place value to 1,000,000",
      "Addition and subtraction (column method)",
      "Times tables to 12x12",
      "Short and long multiplication",
      "Short and long division",
      "Fractions: equivalence and simplifying",
      "Adding and subtracting fractions",
      "Decimals and percentages",
      "Measurement: length, mass and capacity",
      "Perimeter, area and volume",
      "Angles and 2D shape properties",
      "Reading and drawing charts",
      "Multi-step word problems",
    ],
  },
  {
    slug: "ks3-maths-bridge",
    title: "KS3 Maths (Years 7-9)",
    subject: "Maths",
    stage: "ks3",
    summary: "Bridging primary arithmetic into algebra, ratio and geometry.",
    description:
      "The KS3 years are where gaps quietly open up before GCSE. This course covers the full Year 7-9 programme of study, with diagnostic checks each half term so we can go back over anything that has not stuck.",
    price_pence: 3200,
    session_length: "1 hour, weekly",
    exam_boards: "National curriculum",
    topics: [
      "Negative numbers and order of operations",
      "Prime factors, HCF and LCM",
      "Introduction to algebraic notation",
      "Solving linear equations",
      "Expanding and factorising",
      "Sequences and the nth term",
      "Ratio and proportion",
      "Percentages: increase, decrease and reverse",
      "Straight line graphs",
      "Angles in parallel lines and polygons",
      "Transformations",
      "Averages and data handling",
      "Probability basics",
    ],
  },
  {
    slug: "ks3-science",
    title: "KS3 Science (Years 7-9)",
    subject: "Science",
    stage: "ks3",
    summary: "Biology, chemistry and physics fundamentals with practical investigation skills.",
    description:
      "A single course covering all three sciences at KS3, with an emphasis on working scientifically: variables, fair tests, graphs and conclusions. Ideal preparation for setting decisions at the end of Year 9.",
    price_pence: 3200,
    session_length: "1 hour, weekly",
    exam_boards: "National curriculum",
    topics: [
      "Cells and organisation",
      "Body systems: digestion and circulation",
      "Reproduction and inheritance",
      "Photosynthesis and ecosystems",
      "Particle model and states of matter",
      "Atoms, elements and compounds",
      "Chemical reactions and word equations",
      "Acids and alkalis",
      "Forces and motion",
      "Energy stores and transfers",
      "Electricity and circuits",
      "Light and sound waves",
      "Working scientifically: variables and graphs",
    ],
  },
  {
    slug: "gcse-maths-higher",
    title: "GCSE Maths (Higher Tier)",
    subject: "Maths",
    stage: "gcse",
    summary: "Full Higher tier coverage with exam technique for grades 6-9.",
    description:
      "Complete Higher tier coverage across all exam boards, including the topics that decide grades 7-9: surds, algebraic fractions, circle theorems, vectors and iterative methods. Past paper questions every session.",
    price_pence: 3800,
    session_length: "1 hour, weekly",
    exam_boards: "AQA · Edexcel · OCR",
    topics: [
      "Surds and indices",
      "Algebraic fractions",
      "Quadratics: factorising, formula, completing the square",
      "Simultaneous equations (linear and quadratic)",
      "Inequalities and regions",
      "Functions and inverse functions",
      "Iteration and numerical methods",
      "Circle theorems",
      "Trigonometry: SOHCAHTOA",
      "Sine and cosine rules",
      "Vectors and geometric proof",
      "Similarity and congruence",
      "Histograms and cumulative frequency",
      "Probability trees and conditional probability",
      "Direct and inverse proportion",
      "Transformations of graphs",
    ],
  },
  {
    slug: "gcse-combined-science",
    title: "GCSE Combined Science (Trilogy)",
    subject: "Science",
    stage: "gcse",
    summary: "Biology, chemistry and physics content plus the required practicals.",
    description:
      "Covers the combined science specification including all required practicals and the maths skills that appear in the papers. We rotate across the three sciences so nothing is left until the last term.",
    price_pence: 3800,
    session_length: "1 hour, weekly",
    exam_boards: "AQA · Edexcel · OCR Gateway",
    topics: [
      "Cell biology and transport",
      "Infection and response",
      "Bioenergetics",
      "Homeostasis and the nervous system",
      "Inheritance, variation and evolution",
      "Atomic structure and the periodic table",
      "Bonding, structure and properties",
      "Quantitative chemistry",
      "Chemical and energy changes",
      "Rates of reaction and organic chemistry",
      "Energy and efficiency",
      "Electricity",
      "Particle model and atomic structure",
      "Forces and motion",
      "Waves and electromagnetism",
      "Required practicals and working scientifically",
    ],
  },
  {
    slug: "alevel-maths",
    title: "A Level Maths",
    subject: "Maths",
    stage: "alevel",
    summary: "Pure, statistics and mechanics across Years 12 and 13.",
    description:
      "Year 12 and Year 13 content taught alongside school, with a focus on the proof and modelling skills that students find hardest in the transition from GCSE. Includes support for the large data set.",
    price_pence: 4500,
    session_length: "1 hour, weekly",
    exam_boards: "AQA · Edexcel · OCR · MEI",
    topics: [
      "Proof: deduction, exhaustion and counter-example",
      "Algebraic methods and partial fractions",
      "Binomial expansion",
      "Coordinate geometry and circles",
      "Trigonometric identities and equations",
      "Differentiation from first principles",
      "Chain, product and quotient rules",
      "Integration and areas under curves",
      "Integration by parts and substitution",
      "Exponentials and logarithms",
      "Parametric equations",
      "Numerical methods",
      "Vectors in 2D and 3D",
      "Statistical sampling and the large data set",
      "Probability distributions (binomial and normal)",
      "Hypothesis testing",
      "Kinematics and constant acceleration",
      "Newton's laws and connected particles",
      "Moments",
    ],
  },
]

const SATURDAY = [
  {
    slug: "sat-ks2-maths-booster",
    title: "KS2 Maths Booster",
    subject: "Maths",
    stage: "ks2",
    starts: "09:00",
    ends: "10:00",
    tutor: "Ms Rowan Blake",
    room: "Room 1",
    capacity: 8,
    price_pence: 1800,
    description:
      "Arithmetic fluency and a weekly problem-solving challenge. Groups of no more than eight, split by year group.",
  },
  {
    slug: "sat-gcse-maths-clinic",
    title: "GCSE Maths Higher Clinic",
    subject: "Maths",
    stage: "gcse",
    starts: "09:00",
    ends: "10:30",
    tutor: "Mr Idris Bello",
    room: "Room 2",
    capacity: 10,
    price_pence: 2500,
    description:
      "Bring the questions you got stuck on that week. We work them through on the board, then drill the same idea on fresh questions.",
  },
  {
    slug: "sat-ks3-maths",
    title: "KS3 Maths and Problem Solving",
    subject: "Maths",
    stage: "ks3",
    starts: "11:00",
    ends: "12:00",
    tutor: "Mr Idris Bello",
    room: "Room 2",
    capacity: 10,
    price_pence: 2000,
    description:
      "Keeps Year 7 to 9 ahead of the school scheme of work, with UKMT junior challenge questions once a month.",
  },
  {
    slug: "sat-gcse-science-lab",
    title: "GCSE Science Practical Lab",
    subject: "Science",
    stage: "gcse",
    starts: "10:30",
    ends: "12:00",
    tutor: "Dr Nina Shah",
    room: "Laboratory",
    capacity: 12,
    price_pence: 3000,
    description:
      "The required practicals, actually carried out rather than described, with the exam questions that come from each one.",
  },
  {
    slug: "sat-alevel-maths",
    title: "A Level Maths Workshop",
    subject: "Maths",
    stage: "alevel",
    starts: "12:00",
    ends: "13:30",
    tutor: "Ms Rowan Blake",
    room: "Room 3",
    capacity: 8,
    price_pence: 3200,
    description:
      "Pure, statistics and mechanics on a rotation, pitched at the step up from GCSE in Year 12 and revision in Year 13.",
  },
]

const REVIEWS = [
  {
    course: "gcse-maths-higher",
    author_name: "Priya S. (parent)",
    rating: 5,
    title: "From a grade 4 to a grade 7",
    body: "My daughter went into Year 11 predicted a 4 and came out with a 7. The weekly topic ticks meant I could actually see what had been covered instead of guessing.",
  },
  {
    course: "ks2-maths-foundations",
    author_name: "Daniel O.",
    rating: 5,
    title: "He stopped dreading maths homework",
    body: "Patient, calm and never made him feel behind. Within a term he was volunteering answers in class.",
  },
  {
    course: "ks3-science",
    author_name: "Laura B. (parent)",
    rating: 5,
    title: "Great bridge into GCSE",
    body: "We started in Year 8 to fill gaps and she is now confidently in the top set. The progress tracker is genuinely useful at parents evening.",
  },
  {
    course: null,
    author_name: "Chris M. (parent)",
    rating: 4,
    title: "Well organised tutoring",
    body: "Booking, invoices and session notes are all straightforward. Two children on different courses and it has never been confusing.",
  },
]

export function seed() {
  if ((db.query("SELECT COUNT(*) as n FROM courses").get() as { n: number }).n > 0) return

  const insertCourse = db.prepare(
    "INSERT INTO courses (slug, title, subject, stage, summary, description, price_pence, session_length, exam_boards) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
  )
  const insertTopic = db.prepare("INSERT INTO topics (course_id, title, position) VALUES (?, ?, ?)")

  db.transaction(() => {
    for (const course of COURSES) {
      const id = (
        insertCourse.get(
          course.slug,
          course.title,
          course.subject,
          course.stage,
          course.summary,
          course.description,
          course.price_pence,
          course.session_length,
          course.exam_boards,
        ) as { id: number }
      ).id
      course.topics.forEach((title, index) => insertTopic.run(id, title, index + 1))
    }

    const insertClass = db.prepare(
      "INSERT INTO saturday_classes (slug, title, subject, stage, starts, ends, tutor, room, capacity, price_pence, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    for (const item of SATURDAY)
      insertClass.run(
        item.slug,
        item.title,
        item.subject,
        item.stage,
        item.starts,
        item.ends,
        item.tutor,
        item.room,
        item.capacity,
        item.price_pence,
        item.description,
      )

    const insertReview = db.prepare(
      "INSERT INTO reviews (course_id, author_name, rating, title, body) VALUES ((SELECT id FROM courses WHERE slug = ?), ?, ?, ?, ?)",
    )
    for (const review of REVIEWS)
      insertReview.run(review.course, review.author_name, review.rating, review.title, review.body)
  })()
}
