import unittest

from build import pair_sentences, split_de_sents


class SentencePairingTests(unittest.TestCase):
    def test_does_not_split_dates_or_numbered_names(self):
        text = "Am 13. August begann es. Der 1. FC gewann."
        self.assertEqual(
            split_de_sents(text),
            ["Am 13. August begann es.", "Der 1. FC gewann."],
        )

    def test_splits_when_next_sentence_starts_with_number(self):
        text = "Verstörende Bilder in Mannheim. 1400 Polizisten sind im Einsatz."
        self.assertEqual(len(split_de_sents(text)), 2)

    def test_expands_compact_chinese_clause_before_merging_german(self):
        pairs = pair_sentences(
            "Er zeigt neue Technik. Und kündigt eine Kooperation an.",
            "他展示了新技术，并宣布开展合作。",
        )
        self.assertEqual(
            pairs,
            [
                {"de": "Er zeigt neue Technik.", "zh": "他展示了新技术，"},
                {"de": "Und kündigt eine Kooperation an.", "zh": "并宣布开展合作。"},
            ],
        )


if __name__ == "__main__":
    unittest.main()
