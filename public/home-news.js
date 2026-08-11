(() => {
    const feed = document.getElementById('homeNewsFeed');
    if (!feed) return;
    const label = item => item.content_type === 'advertisement' ? 'Publicité'
        : item.content_type === 'announcement' ? 'Annonce'
            : item.content_type === 'post' ? 'Publication membre' : 'Actualité';
    const mediaUrl = (item, id) => item.source === 'platform'
        ? `/api/public/news/media/${encodeURIComponent(id)}`
        : `/api/public/news/social-media/${encodeURIComponent(id)}`;

    fetch('/api/public/news?limit=6').then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Impossible de charger les actualités.');
        feed.replaceChildren();
        if (!data.items.length) {
            feed.textContent = 'Aucune actualité ou publicité publique pour le moment.';
            return;
        }
        data.items.forEach(item => {
            const article = document.createElement('article');
            article.className = 'feed-post public-news-item';
            const heading = document.createElement('h3');
            heading.textContent = item.title || label(item);
            const meta = document.createElement('p');
            meta.className = 'field-hint';
            meta.textContent = `${label(item)} · ${new Date(item.published_at).toLocaleDateString('fr-FR')}`;
            const body = document.createElement('p');
            body.textContent = item.body;
            article.append(heading, meta, body);
            (item.media_ids || (item.media_id ? [item.media_id] : [])).slice(0, 1).forEach(id => {
                const image = document.createElement('img');
                image.className = 'feed-image';
                image.src = mediaUrl(item, id);
                image.alt = item.title || label(item);
                image.loading = 'lazy';
                article.appendChild(image);
            });
            feed.appendChild(article);
        });
    }).catch(error => { feed.textContent = error.message; });
})();
