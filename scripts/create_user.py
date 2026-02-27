#!/usr/bin/env python3
"""Cria um usuário jogador no banco. Uso: python scripts/create_user.py [email] [password] [name]
Exemplo: python scripts/create_user.py teste@teste.com testeteste 'Jogador Teste'
Se não passar argumentos, cria teste@teste.com / testeteste / Teste."""
from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

# Carregar .env antes de importar config/db
_env = REPO_ROOT / ".env"
if _env.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(_env)
    except ImportError:
        pass

from sqlmodel import Session, select
from apps.api.backend.db import engine, init_db
from apps.api.backend.models.user import User, Role
from apps.api.backend.security.password import hash_password


def main() -> None:
    name = (sys.argv[3] if len(sys.argv) > 3 else "Teste").strip()
    email = (sys.argv[1] if len(sys.argv) > 1 else "teste@teste.com").strip().lower()
    password = (sys.argv[2] if len(sys.argv) > 2 else "testeteste").strip()

    if len(password) < 8:
        print("Erro: senha deve ter pelo menos 8 caracteres.")
        sys.exit(1)

    init_db()
    with Session(engine) as session:
        existing = session.exec(select(User).where(User.email == email)).first()
        if existing:
            print(f"Usuário com e-mail {email} já existe (id={existing.id}).")
            sys.exit(0)
        user = User(
            name=name,
            email=email,
            password_hash=hash_password(password),
            role=Role.PLAYER,
            must_reset_password=False,
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        print(f"Criado jogador: id={user.id}, email={user.email}, name={user.name}")


if __name__ == "__main__":
    main()
