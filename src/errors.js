
class NotLoggedIntoStoreError extends Error {
  constructor(...a) {
    super(...a);
  }
}


class SubmissionNotFoundError extends Error {
  constructor(...a) {
    super(...a);
  }
}


/**
 * Represents a server-side logical error where the CNI challenge
 * setup is in an inconsistent or undefined state.
 */
class CniCubeIntegrityError extends Error {
  constructor(...a) {
    super(...a);
  }
}

module.exports = {
  NotLoggedIntoStoreError, SubmissionNotFoundError, CniCubeIntegrityError
}
