// Where a phone visitor was when they went from a posting back to the list
// (JobSwipePage's All jobs): the posting they were reading and the list page
// it's on. JobBoardPage turns to that page and scrolls that card into view,
// then clears it.
export const boardReturn: { jobId: string | null; page: number } = { jobId: null, page: 1 };
