#!/usr/bin/env python
"""
Git commit hook:
 .git/hooks/commit-msg
 Check commit message according to guidelines
"""

import sys
import re

# Have a commit message
REGEX_COMMIT_MESSAGE = '^[^\s]{1,3}.*$'

# Keep a short subject line
REGEX_SUBJECT_LINE = '^.{1,100}$'

# Dont end the subject line with a period
REGEX_PERIOD_RULE = '.*[^ .]$'

# Start with a capital letter
# Note: If starts with commit type not needed
REGEX_CAPITAL_RULE = '^[A-Z].+'

# Link to an issue tracker system - Jira
# Note: Optional, add check only if required
REGEX_JIRA_RULE = '((?!([A-Z0-9a-z]{1,10})-?$)[A-Z]{1}[A-Z0-9]+-\d+).+'

# Angulars commit message convention
REGEX_MESSAGE_RULE = '^(feat|fix|docs|style|refactor|test|build|ci|perf|revert|merge)(\(.+\))?\:\s(.{3,})'

GUIDELINE_LINK = 'https://bitbucket.org/codetribe/codetribe-git-message-guideline/src/master/'

with open(sys.argv[1]) as commit:
    lines = commit.readlines()
    if len(lines) == 0:
        sys.stderr.write("\nEmpty commit message\n")
        sys.stderr.write("\nRefer commit guide: {}\n\n".format(GUIDELINE_LINK))
        sys.exit(1)

    match_regex_commit_message = re.match(REGEX_COMMIT_MESSAGE, lines[0])
    match_regex_subject_line = re.match(REGEX_SUBJECT_LINE, lines[0])
    match_regex_period_rule = re.match(REGEX_PERIOD_RULE, lines[0])
    match_regex_message_rule = re.match(REGEX_MESSAGE_RULE, lines[0])

    if match_regex_commit_message is None:
        sys.stderr.write(
            "\nYour commit message subject line does not follow the guideline: Commit Message Rule \n")
        sys.stderr.write(
            "\n - Refer commit guideline: {}\n\n".format(GUIDELINE_LINK))
        sys.exit(1)

    if match_regex_subject_line is None:
        sys.stderr.write(
            "\nYour commit message subject line does not follow the guideline: Message Subject Rule \n")
        sys.stderr.write(
            "\n - Refer commit guideline: {}\n\n".format(GUIDELINE_LINK))
        sys.exit(1)

    if match_regex_period_rule is None:
        sys.stderr.write(
            "\nYour commit message subject line does not follow the guideline: Message Period Rule \n")
        sys.stderr.write(
            "\n - Refer commit guideline: {}\n\n".format(GUIDELINE_LINK))
        sys.exit(1)

    if match_regex_message_rule is None:
        sys.stderr.write(
            "\nYour commit message subject line does not follow the guideline: Commit Type Rule \n")
        sys.stderr.write(
            "\n - Refer commit guideline: {}\n\n".format(GUIDELINE_LINK))
        sys.exit(1)

    sys.stderr.write("\nYour commit message looks good! \n\n")
sys.exit(0)